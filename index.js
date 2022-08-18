/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2021-2022 Toha <tohenk@yahoo.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const { Builder, By, until } = require('selenium-webdriver');
const { Queue, Work } = require('@ntlab/work');

let operaService;

class WebRobot {

    CHROME = 'chrome'
    FIREFOX = 'firefox'
    OPERA = 'opera'

    SELECT = 1
    CHECKBOX = 2
    RADIO = 3
    OTHER = 4

    constructor(options) {
        this.options = options || {};
        this.workdir = this.options.workdir || __dirname;
        this.browser = this.options.browser || this.CHROME;
        this.session = this.options.session;
        this.url = this.options.url;
        this.timeout = this.options.timeout || 10000;
        this.wait = this.options.wait || 1000;
        this.ready = false;
        this.browsers = [this.CHROME, this.FIREFOX, this.OPERA];
        this.initialize();
        this.setup();
    }

    initialize() {
    }

    setup() {
        const f = () => {
            this.ready = true;
            if (typeof this.onready == 'function') {
                this.onready();
            }
        }
        if (this.browser == this.FIREFOX) {
            const profile = this.getProfileDir();
            if (!fs.existsSync(profile)) {
                const Channel = require('selenium-webdriver/firefox').Channel;
                Channel.RELEASE.locate()
                    .then((ff) => {
                        const shasum = require('crypto').createHash('sha1');
                        shasum.update(fs.realpathSync(path.join(__dirname, '..')) + new Date().getTime());
                        const profileName = 'WebRobot.' + shasum.digest('hex').substr(0, 8);
                        const exec = require('child_process').exec;
                        if (ff.indexOf(' ') > 0) ff = `"${ff}"`;
                        // https://developer.mozilla.org/en-US/docs/Mozilla/Command_Line_Options#User_Profile
                        const p = exec(`${ff} -CreateProfile "${profileName} ${profile}" -no-remote`);
                        p.on('close', (code) => {
                            console.log('Mozilla Firefox create profile returns %d', code);
                            f();
                        });
                    })
                ;
            } else {
                f();
            }
        } else {
            f();
        }
    }

    getDriver() {
        if (!this.driver) {
            if (this.browsers.indexOf(this.browser) < 0) {
                throw new Error('Unsupported browser, supported browsers: ' + this.browsers.join(', '));
            }
            let options;
            const profile = this.getProfileDir();
            const downloaddir = this.options.downloaddir;
            switch (this.browser) {
                case this.CHROME:
                case this.OPERA:
                    const ChromeOptions = require('selenium-webdriver/chrome').Options;
                    options = new ChromeOptions();
                    options.addArguments('start-maximized');
                    options.addArguments('user-data-dir=' + profile);
                    if (downloaddir) {
                        options.setUserPreferences({'download.default_directory': downloaddir});
                    }
                    break;
                case this.FIREFOX:
                    const FirefoxOptions = require('selenium-webdriver/firefox').Options;
                    options = new FirefoxOptions();
                    options.setProfile(profile);
                    if (downloaddir) {
                        options.setPreference('browser.download.dir', downloaddir);
                    }
                    break;
            }
            this.driver = this.createDriver(options);
            // opera doesn't honor download.default_directory
            if (downloaddir && this.browser == this.OPERA) {
                this.driver.setDownloadPath(downloaddir);
            }
        }
        return this.driver;
    }

    getProfileDir() {
        const profiledir = path.join(this.workdir, 'profile');
        if (!fs.existsSync(profiledir)) {
            fs.mkdirSync(profiledir);
        }
        return path.join(profiledir, this.browser + (this.session ? '-' + this.session : ''));
    }

    createDriver(options) {
        let builder;
        switch (this.browser) {
            case this.CHROME:
            case this.OPERA:
                builder = new Builder()
                    .forBrowser(this.CHROME)
                    .setChromeOptions(options);
                if (this.browser == this.OPERA) {
                    if (!operaService) {
                        const { ServiceBuilder } = require('selenium-webdriver/chrome');
                        const { findInPath } = require('selenium-webdriver/io');
                        operaService = new ServiceBuilder(findInPath(process.platform == 'win32' ? 'operadriver.exe' : 'operadriver', true));
                    }
                    builder.setChromeService(operaService);
                }
                break;
            case this.FIREFOX:
                builder = new Builder()
                    .forBrowser(this.browser)
                    .setFirefoxOptions(options);
                break;
        }
        return builder.build();
    }

    sleep(ms) {
        return this.getDriver().sleep(ms ? ms : this.wait);
    }

    open() {
        if (this.opened && this.driver) {
            return Promise.resolve();
        }
        return Work.works([
            [w => this.getDriver().get(this.url)],
            [w => new Promise((resolve, reject) => {
                this.opened = true;
                if (this.browser == this.FIREFOX) {
                    this.getDriver().manage().window().maximize();
                }
                resolve();
            })],
        ]);
    }

    close() {
        if (!this.driver) {
            return Promise.resolve();
        }
        return Work.works([
            [w => this.getDriver().quit()],
        ], {
            done: () => new Promise((resolve, reject) => {
                this.driver = null;
                this.opened = false;
                resolve();
            })
        });
    }

    fillInForm(values, form, submit) {
        return Work.works([
            [w => this.waitFor(form)],
            [w => new Promise((resolve, reject) => {
                const q = new Queue(values, data => {
                    const next = () => {
                        if (typeof data.done == 'function') {
                            data.done(data, () => q.next());
                        } else {
                            q.next();
                        }
                    }
                    // set parent if target is a relative path
                    if (data.parent == undefined && data.target.using == 'xpath' && data.target.value.substring(0, 1) == '.') {
                        data.parent = w.getRes(0);
                    }
                    Work.works([
                        [w => this.sleep(this.wait), w => data.wait],
                        [w => new Promise((resolve, reject) => {
                            this.findElement(data.parent)
                                .then(res => {
                                    data.parent = res;
                                    resolve();
                                })
                                .catch(err => reject(err))
                            ;
                        }), w => data.parent instanceof By],
                        [w => new Promise((resolve, reject) => {
                            this.fillFormValue(data)
                                .then(() => next())
                                .catch(err => {
                                    // https://stackoverflow.com/questions/38750705/filter-object-properties-by-key-in-es6
                                    const d = Object.keys(data)
                                        .filter(key => key != 'handler')
                                        .reduce((obj, key) => {
                                            obj[key] = data[key];
                                            return obj;
                                        }, {});
                                    console.error('Unable to fill form value %s: %s!', util.inspect(d), err);
                                    reject(err);
                                })
                            ;
                        })],
                    ])
                    .then(() => next())
                    .catch(err => reject(err));
                });
                q.once('done', () => {
                    Work.works([
                        [w => this.findElement(submit), w => submit],
                        [w => w.getRes(0).click(), w => submit],
                        [w => Promise.resolve()],
                    ])
                    .then(() => resolve())
                    .catch(err => reject(err));
                });
            })],
        ]);
    }

    fillFormValue(data) {
        return Work.works([
            [w => Promise.resolve(data.parent ? data.parent.findElements(data.target): this.findElements(data.target))],
            [w => Promise.reject('Element not found!'), w => w.getRes(0).length == 0],
            [w => Promise.reject('Multi elements found!'), w => w.getRes(0).length > 1],
            [w => w.getRes(0)[0].getTagName()],
            [w => w.getRes(0)[0].getAttribute('type')],
            [w => Promise.resolve(typeof data.converter == 'function' ? data.converter(data.value) : data.value)],
            // custom fill in value
            [w => new Promise((resolve, reject) => {
                const f = () => {
                    if (typeof data.onfill == 'function') {
                        data.onfill(w.getRes(0)[0], w.getRes(5))
                            .then(() => resolve(false))
                            .catch(err => reject(err));
                    } else {
                        resolve(true);
                    }
                }
                if (typeof data.canfill == 'function') {
                    data.canfill(w.getRes(3), w.getRes(0)[0], w.getRes(5))
                        .then(result => {
                            if (result) {
                                resolve(false);
                            } else {
                                f();
                            }
                        })
                        .catch(err => reject(err));
                } else {
                    f();
                }
            })],
            // select
            [w => this.fillSelect(w.getRes(0)[0], w.getRes(5)),
                w => w.getRes(6) && this.getInputType(w.getRes(3), w.getRes(4)) == this.SELECT],
            // checkbox
            [w => this.fillCheckbox(w.getRes(0)[0], w.getRes(5)),
                w => w.getRes(6) && this.getInputType(w.getRes(3), w.getRes(4)) == this.CHECKBOX],
            // radio
            [w => this.fillRadio(w.getRes(0)[0], w.getRes(5)),
                w => w.getRes(6) && this.getInputType(w.getRes(3), w.getRes(4)) == this.RADIO],
            // other inputs
            [w => this.fillInput(w.getRes(0)[0], w.getRes(5)),
                w => w.getRes(6) && this.getInputType(w.getRes(3), w.getRes(4)) == this.OTHER],
        ]);
    }

    getInputType(tag, type) {
        let input = this.OTHER;
        switch (tag) {
            case 'input':
                if (type == 'checkbox') {
                    input = this.CHECKBOX;
                } else if (type == 'radio') {
                    input = this.RADIO;
                }
                break;
            case 'select':
                input = this.SELECT;
                break;
        }
        return input;
    }

    fillSelect(el, value) {
        return Work.works([
            [w => this.click({el: el, data: By.xpath('//option[@value="' + value + '"]')})],
        ]);
    }

    fillCheckbox(el, value) {
        return Work.works([
            [w => el.click(), w => el.isSelected() != value],
        ]);
    }

    fillRadio(el, value) {
        return Work.works([
            [w => el.click()],
        ]);
    }

    fillInput(el, value) {
        return Work.works([
            [w => el.clear()],
            [w => el.sendKeys(value), w => null != value],
        ]);
    }

    getFormValues(form, fields, useId = false) {
        return new Promise((resolve, reject) => {
            const values = {};
            const q = new Queue(fields, (name) => {
                const next = () => q.next();
                Work.works([
                    [w => form.findElement(useId ? By.id(name) : By.xpath('//*[@name="' + name + '"]'))],
                    [w => w.res.getAttribute('type')],
                    [w => w.pres.getAttribute(w.res == 'checkbox' ? 'checked' : 'value')],
                ])
                .then(value => {
                    values[name] = value;
                    next();
                })
                .catch(() => next());
            });
            q.once('done', () => resolve(values));
        });
    }

    findElements(data) {
        if (data.el && data.data) {
            return data.el.findElements(data.data);
        }
        return this.getDriver().findElements(data);
    }

    findElement(data) {
        if (data.el && data.data) {
            return data.el.findElement(data.data);
        }
        return this.getDriver().findElement(data);
    }

    click(data) {
        return Work.works([
            [w => this.findElement(data)],
            [w => w.res.click()],
        ]);
    }

    waitFor(data) {
        return Work.works([
            [w => this.getDriver().wait(until.elementLocated(data), this.timeout)],
        ]);
    }

    waitAndClick(data) {
        return Work.works([
            [w => this.waitFor(data)],
            [w => w.res.click()],
        ]);
    }

    getText(items, parent) {
        if (!parent) {
            parent = this.getDriver();
        }
        return new Promise((resolve, reject) => {
            const result = [];
            const q = new Queue(items, item => {
                Work.works([
                    [w => parent.findElement(item)],
                    [w => w.res.getAttribute('innerText')],
                ])
                .then(text => {
                    result.push(text);
                    q.next();
                })
                .catch(err => reject(err));
            });
            q.once('done', () => resolve(result))
        });
    }

    alert(message) {
        return this.getDriver().executeScript('alert("' + message + '")');
    }
}

module.exports = WebRobot;