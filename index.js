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
const { Builder, By, until } = require('selenium-webdriver');
const { Queue, Work } = require('@ntlab/work');

class WebRobot {

    CHROME = 'chrome'
    FIREFOX = 'firefox'

    constructor(options) {
        this.options = options || {};
        this.workdir = this.options.workdir || __dirname;
        this.browser = this.options.browser || this.CHROME;
        this.session = this.options.session;
        this.url = this.options.url;
        this.timeout = this.options.timeout || 10000;
        this.wait = this.options.wait || 1000;
        this.ready = false;
        this.browsers = [this.CHROME, this.FIREFOX];
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
            switch (this.browser) {
                case this.CHROME:
                    const ChromeOptions = require('selenium-webdriver/chrome').Options;
                    options = new ChromeOptions();
                    options.addArguments('start-maximized');
                    options.addArguments('user-data-dir=' + profile);
                    break;
                case this.FIREFOX:
                    const FirefoxOptions = require('selenium-webdriver/firefox').Options;
                    options = new FirefoxOptions();
                    options.setProfile(profile);
                    break;
            }
            this.driver = this.createDriver(options);
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
        switch (this.browser) {
            case this.CHROME:
                return new Builder()
                    .forBrowser(this.browser)
                    .setChromeOptions(options)
                    .build();
            case this.FIREFOX:
                return new Builder()
                    .forBrowser(this.browser)
                    .setFirefoxOptions(options)
                    .build();
        }
    }

    sleep(ms) {
        return this.getDriver().sleep(ms ? ms : this.wait);
    }

    open() {
        if (this.opened && this.driver) {
            return Promise.resolve();
        }
        return Work.works([
            w => this.getDriver().get(this.url),
            w => new Promise((resolve, reject) => {
                this.opened = true;
                if (this.browser == this.FIREFOX) {
                    this.getDriver().manage().window().maximize();
                }
                resolve();
            }),
        ]);
    }

    fillInForm(values, check, submit) {
        return Work.works([
            w => this.waitFor(check),
            w => new Promise((resolve, reject) => {
                const q = new Queue(values, data => {
                    const next = () => {
                        if (typeof data.done == 'function') {
                            data.done(data, () => q.next());
                        } else {
                            q.next();
                        }
                    }
                    data.handler = () => {
                        this.fillFormValue(data)
                            .then(() => next())
                            .catch(err => reject(err))
                        ;
                    }
                    if (data.wait) {
                        this.getDriver().sleep(this.wait)
                            .then(() => data.handler())
                        ;
                    } else {
                        data.handler();
                    }
                });
                q.once('done', () => {
                    if (submit) {
                        Work.works([
                            w => this.findElement(submit),
                            w => w.getRes(0).click(),
                        ])
                        .then(() => resolve())
                        .catch(err => reject(err));
                    } else {
                        resolve();
                    }
                });
            })
        ]);
    }

    fillFormValue(data) {
        return Work.works([
            w => this.findElement(data.target),
            w => w.getRes(0).getTagName(),
            w => w.getRes(0).getAttribute('type'),
            w => new Promise((resolve, reject) => {
                let value = data.value;
                if (typeof data.converter == 'function') {
                    value = data.converter(value);
                }
                resolve(value);
            }),
            // select
            [w => this.click({el: w.getRes(0), data: By.xpath('//option[@value="' + w.getRes(3) + '"]')}),
                w => w.getRes(1) == 'select'],
            // checkbox
            [w => this.fillCheckbox(w.getRes(0), w.getRes(3)),
                w => w.getRes(1) == 'input' && w.getRes(2) == 'checkbox'],
            // other inputs
            [w => this.fillInput(w.getRes(0), w.getRes(3)),
                w => (w.getRes(1) == 'input' && w.getRes(2) != 'checkbox') || w.getRes(1) != 'select'],
        ]);
    }

    fillInput(el, value) {
        return Work.works([
            w => el.clear(),
            [w => el.sendKeys(value), w => null != value],
        ]);
    }

    fillCheckbox(el, value) {
        return Work.works([
            [w => el.click(), w => el.isSelected() != value],
        ]);
    }

    getFormValues(form, fields, useId = false) {
        return new Promise((resolve, reject) => {
            const values = {};
            const q = new Queue(fields, (name) => {
                const next = () => q.next();
                Work.works([
                    w => form.findElement(useId ? By.id(name) : By.xpath('//*[@name="' + name + '"]')),
                    w => w.res.getAttribute('type'),
                    w => w.pres.getAttribute(w.res == 'checkbox' ? 'checked' : 'value'),
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

    findElement(data) {
        if (data.el && data.data) {
            return data.el.findElement(data.data);
        }
        return this.getDriver().findElement(data);
    }

    click(data) {
        return Work.works([
            w => this.findElement(data),
            w => w.res.click(),
        ]);
    }

    waitFor(data) {
        return Work.works([
            w => this.getDriver().wait(until.elementLocated(data), this.timeout),
        ]);
    }

    waitAndClick(data) {
        return Work.works([
            w => this.waitFor(data),
            w => w.res.click(),
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
                    w => parent.findElement(item),
                    w => w.res.getAttribute('innerText'),
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