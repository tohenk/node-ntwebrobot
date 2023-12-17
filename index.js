/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2021-2023 Toha <tohenk@yahoo.com>
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
const { Builder, By, until, WebDriver, WebElement } = require('selenium-webdriver');
const { Queue, Work } = require('@ntlab/work');

let operaService;
const expectedErrors = [];
const loggedErrors = [];

/**
 * A form field value converter callback.
 *
 * @callback valueConverterCallback
 * @param {string} value Value
 * @returns {string}
 */

/**
 * A form field value fill callback.
 *
 * @callback valueFillCallback
 * @param {WebElement} el Element
 * @param {string} value Value
 * @returns {Promise}
 */

/**
 * A form field value can fill callback. The callback must return true if its handled.
 *
 * @callback valueCanFillCallback
 * @param {string} tag Element tag name
 * @param {WebElement} el Element
 * @param {string} value Value
 * @returns {Promise<boolean>}
 */

/**
 * A base class for Selenium automation.
 *
 * @author Toha <tohenk@yahoo.com>
 */
class WebRobot {

    CHROME = 'chrome'
    FIREFOX = 'firefox'
    OPERA = 'opera'

    SELECT = 1
    CHECKBOX = 2
    RADIO = 3
    TEXTAREA = 4
    OTHER = 5

    /**
     * Constructor.
     *
     * @param {object} options Constructor options
     * @param {string} options.workdir Working directory
     * @param {string} options.browser Browser to use, can be chrome, firefox or opera
     * @param {string} options.session Session name
     * @param {string} options.url Default url for open
     * @param {number} options.timeout Operation timeout (ms)
     * @param {number} options.wait Wait delay (ms)
     */
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

    /**
     * Do initialization.
     */
    initialize() {
    }

    /**
     * Do setup.
     */
    setup() {
        const f = () => {
            this.ready = true;
            if (typeof this.onReady === 'function') {
                this.onReady();
            }
        }
        if (this.browser === this.FIREFOX) {
            const profile = this.getProfileDir();
            if (!fs.existsSync(profile)) {
                const Channel = require('selenium-webdriver/firefox').Channel;
                Channel.RELEASE.locate()
                    .then(ff => {
                        const shasum = require('crypto').createHash('sha1');
                        shasum.update(fs.realpathSync(path.join(__dirname, '..')) + new Date().getTime());
                        const profileName = 'WebRobot.' + shasum.digest('hex').substr(0, 8);
                        const exec = require('child_process').exec;
                        if (ff.indexOf(' ') > 0) {
                            ff = `"${ff}"`;
                        }
                        // https://developer.mozilla.org/en-US/docs/Mozilla/Command_Line_Options#User_Profile
                        const p = exec(`${ff} -CreateProfile "${profileName} ${profile}" -no-remote`);
                        p.on('close', code => {
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

    /**
     * Get web driver.
     *
     * @returns {WebDriver}
     */
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
                    options.addArguments(`user-data-dir=${profile}`);
                    if (downloaddir) {
                        options.setUserPreferences({
                            'download.default_directory': downloaddir,
                            'profile.default_content_setting_values.automatic_downloads': 1,
                        });
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
            if (this.options.headless) {
                options.addArguments(`headless=${this.options.headless}`);
            }
            this.driver = this.createDriver(options);
            // opera doesn't honor download.default_directory
            if (downloaddir && this.browser === this.OPERA) {
                this.driver.setDownloadPath(downloaddir);
            }
        }
        return this.driver;
    }

    /**
     * Get browser profile directory.
     *
     * @returns {string}
     */
    getProfileDir() {
        const profiledir = path.join(this.workdir, 'profile');
        if (!fs.existsSync(profiledir)) {
            fs.mkdirSync(profiledir);
        }
        return path.join(profiledir, this.browser + (this.session ? '-' + this.session : ''));
    }

    /**
     * Create web driver.
     *
     * @param {object} options Browser options
     * @returns {WebDriver}
     */
    createDriver(options) {
        let builder;
        switch (this.browser) {
            case this.CHROME:
            case this.OPERA:
                builder = new Builder()
                    .forBrowser(this.CHROME)
                    .setChromeOptions(options);
                if (this.browser === this.OPERA) {
                    if (!operaService) {
                        const { ServiceBuilder } = require('selenium-webdriver/chrome');
                        const { findInPath } = require('selenium-webdriver/io');
                        operaService = new ServiceBuilder(findInPath(process.platform === 'win32' ? 'operadriver.exe' : 'operadriver', true));
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

    /**
     * A proxy function for Work.works.
     *
     * @param {Array} w Work list
     * @param {object} options Work options
     * @returns {Promise}
     * @see Work.works
     */
    works(w, options) {
        options = options || {};
        if (!options.onerror) {
            options.onerror = w => {
                if (w.err instanceof Error && WebRobot.isErr(w.err)) {
                    if (loggedErrors.indexOf(w.err) < 0) {
                        loggedErrors.push(w.err);
                        console.error('Got error doing %s!\n%s', w.current.info, w.err);
                    } else {
                        let lines = w.current.info.split('\n');
                        let indent = 0;
                        lines.forEach(line => {
                            const match = line.match(/^\s+/);
                            if (match) {
                                if (indent === 0 || match[0].length < indent) {
                                    indent = match[0].length;
                                }
                            }
                        });
                        if (indent > 0) {
                            lines = lines.map(line => line.substr(0, indent) === ' '.repeat(indent) ? line.substr(indent - 3) : line);
                        }
                        console.error('-> %s', lines.join('\n'));
                    }
                }
            }
        }
        return Work.works(w, options);
    }

    /**
     * Sleep for milliseconds.
     *
     * @param {number|undefined} ms Milliseconds to sleep
     * @returns {Promise}
     */
    sleep(ms) {
        return this.getDriver().sleep(ms !== undefined ? ms : this.wait);
    }

    /**
     * Open an url.
     *
     * @param {string|undefined} url Url to open using get
     * @returns {Promise}
     */
    open(url) {
        url = url || this.url;
        if (this._url === url && this.driver) {
            return Promise.resolve();
        }
        return this.works([
            [w => this.getDriver().get(url)],
            [w => new Promise((resolve, reject) => {
                this._url = url;
                if (this.browser === this.FIREFOX) {
                    this.getDriver().manage().window().maximize();
                }
                if (typeof this.onOpen === 'function') {
                    this.onOpen();
                }
                resolve();
            })],
        ]);
    }

    /**
     * Close and destroy web driver.
     *
     * @returns {Promise}
     */
    close() {
        if (!this.driver) {
            return Promise.resolve();
        }
        return this.works([
            [w => this.driver.quit()],
        ], {
            done: () => new Promise((resolve, reject) => {
                delete this.driver;
                delete this._url;
                resolve();
            })
        });
    }

    /**
     * Do fill in form.
     *
     * @param {Array} values Form values
     * @param {WebElement} form Form element
     * @param {WebElement} submit Submit element
     * @param {number} wait Wait milliseconds
     * @returns {Promise}
     */
    fillInForm(values, form, submit, wait = 0) {
        return this.works([
            [w => this.waitFor(form)],
            [w => this.getDriver().wait(until.elementIsVisible(w.getRes(0)))],
            [w => new Promise((resolve, reject) => {
                const q = new Queue(values, data => {
                    const next = () => {
                        if (typeof data.done === 'function') {
                            data.done(data, () => q.next());
                        } else {
                            q.next();
                        }
                    }
                    // set parent if target is a relative path
                    if (data.parent === undefined && data.target.using === 'xpath' && data.target.value.startsWith('.')) {
                        data.parent = w.getRes(0);
                    }
                    data.handler = () => {
                        this.works([
                            [x => this.sleep(this.wait), x => data.wait],
                            [x => new Promise((resolve, reject) => {
                                this.findElement(data.parent)
                                    .then(res => {
                                        data.parent = res;
                                        resolve();
                                    })
                                    .catch(err => reject(err))
                                ;
                            }), x => data.parent instanceof By],
                            [x => new Promise((resolve, reject) => {
                                this.fillFormValue(data)
                                    .then(() => resolve())
                                    .catch(err => {
                                        this.works([
                                            [y => data.el.getAttribute('outerHTML'), y => data.el],
                                            [y => Promise.resolve(data.target), y => !data.el],
                                        ])
                                        .then(target => {
                                            console.error('Unable to fill form value %s: %s!', target, err instanceof Error ? err.toString() : err);
                                            reject(err);
                                        });
                                    })
                                ;
                            })],
                        ])
                        .then(() => next())
                        .catch(err => reject(err));
                    }
                    // call handler
                    data.handler();
                });
                q.once('done', () => {
                    this.works([
                        [x => this.sleep(wait), x => submit && wait > 0],
                        [x => this.findElement(submit), x => submit],
                        [x => x.getRes(1).click(), x => submit],
                        [x => Promise.resolve(submit ? x.getRes(1) : w.getRes(0))],
                    ])
                    .then(res => resolve(res))
                    .catch(err => reject(err));
                });
            })],
        ]);
    }

    /**
     * Do form field fill in.
     *
     * @param {object} data Form value data
     * @param {WebElement} data.parent Parent element
     * @param {By} data.target Field element
     * @param {string} data.value Field value
     * @param {valueConverterCallback} data.converter Value converter callback
     * @param {valueFillCallback} data.onfill Value fill callback
     * @param {valueCanFillCallback} data.canfill Value can fill callback
     * @returns {Promise}
     */
    fillFormValue(data) {
        return this.works([
            [w => Promise.resolve(data.parent ? data.parent.findElements(data.target) : this.findElements(data.target))],
            [w => Promise.reject('Element not found!'), w => w.getRes(0).length === 0],
            [w => Promise.reject('Multi elements found!'), w => w.getRes(0).length > 1],
            [w => w.getRes(0)[0].getTagName()],
            [w => w.getRes(0)[0].getAttribute('type')],
            [w => Promise.resolve(typeof data.converter === 'function' ? data.converter(data.value) : data.value)],
            // custom fill in value
            [w => new Promise((resolve, reject) => {
                data.el = w.getRes(0)[0];
                const f = () => {
                    if (typeof data.onfill === 'function') {
                        data.onfill(w.getRes(0)[0], w.getRes(5))
                            .then(() => resolve(false))
                            .catch(err => reject(err));
                    } else {
                        resolve(true);
                    }
                }
                if (typeof data.canfill === 'function') {
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
            // get input type
            [w => Promise.resolve(this.getInputType(w.getRes(3), w.getRes(4))),
                w => w.getRes(6)],
            // select
            [w => this.fillSelect(w.getRes(0)[0], w.getRes(5)),
                w => w.getRes(7) === this.SELECT],
            // checkbox
            [w => this.fillCheckbox(w.getRes(0)[0], w.getRes(5)),
                w => w.getRes(7) === this.CHECKBOX],
            // radio
            [w => this.fillRadio(w.getRes(0)[0], w.getRes(5)),
                w => w.getRes(7) === this.RADIO],
            // textarea
            [w => this.fillTextarea(w.getRes(0)[0], w.getRes(5)),
                w => w.getRes(7) === this.TEXTAREA],
            // other inputs
            [w => this.fillInput(w.getRes(0)[0], w.getRes(5)),
                w => w.getRes(7) === this.OTHER],
            // validate required input
            [w => w.getRes(0)[0].getAttribute('required'),
                w => w.getRes(6) !== this.CHECKBOX],
            [w => w.getRes(0)[0].getAttribute('value'),
                w => w.getRes(13) === 'true'],
            [w => Promise.reject(`Input ${data.target.value} is required!`),
                w => w.getRes(13) === 'true' && w.getRes(14) === ''],
        ]);
    }

    /**
     * Get input type. Input type returned will be one of SELECT, CHECKBOX, RADIO,
     * TEXTAREA, or OTHER.
     *
     * @param {string} tag Element tag name
     * @param {string} type Element type
     * @returns {number}
     */
    getInputType(tag, type) {
        let input = this.OTHER;
        switch (tag) {
            case 'input':
                if (type === 'checkbox') {
                    input = this.CHECKBOX;
                } else if (type === 'radio') {
                    input = this.RADIO;
                }
                break;
            case 'select':
                input = this.SELECT;
                break;
            case 'textarea':
                input = this.TEXTAREA;
                break;
        }
        return input;
    }

    /**
     * Fill a select element.
     *
     * @param {WebElement} el Input element
     * @param {string} value Input value
     * @returns {Promise}
     */
    fillSelect(el, value) {
        return this.works([
            [w => this.click({el: el, data: By.xpath(`//option[@value="${value}"]`)})],
        ]);
    }

    /**
     * Fill a checkbox element.
     *
     * @param {WebElement} el Input element
     * @param {boolean} value Input value
     * @returns {Promise}
     */
    fillCheckbox(el, value) {
        return this.works([
            [w => el.click(), w => el.isSelected() != value],
        ]);
    }

    /**
     * Fill a radio element.
     *
     * @param {WebElement} el Input element
     * @param {boolean} value Input value
     * @returns {Promise}
     */
    fillRadio(el, value) {
        return this.works([
            [w => el.click()],
        ]);
    }

    /**
     * Fill a textarea element.
     *
     * @param {WebElement} el Input element
     * @param {string} value Input value
     * @returns {Promise}
     */
    fillTextarea(el, value) {
        const textAreaSafe = value && value.indexOf('/') >= 0;
        return this.works([
            [w => el.clear()],
            [w => el.sendKeys(value), w => null !== value && !textAreaSafe],
            [w => this.getDriver().executeScript(`arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('change'));`, el, value), w => null !== value && textAreaSafe],
        ]);
    }

    /**
     * Fill an input element.
     *
     * @param {WebElement} el Input element
     * @param {string} value Input value
     * @returns {Promise}
     */
    fillInput(el, value) {
        return this.works([
            [w => el.clear()],
            [w => el.sendKeys(value), w => null !== value],
        ]);
    }

    /**
     * Get form values.
     *
     * @param {WebElement} form Form element
     * @param {Array} fields Form fields
     * @param {boolean} useId Use element id instead of xpath
     * @returns {Promise<object>}
     */
    getFormValues(form, fields, useId = false) {
        return new Promise((resolve, reject) => {
            const values = {};
            const q = new Queue(fields, field => {
                const next = () => q.next();
                let isId = useId;
                if (field.substr(0, 1) === '#') {
                    field = field.substr(1);
                    isId = true;
                }
                this.works([
                    [w => form.findElement(isId ? By.id(field) : By.xpath(`//*[@name="${field}"]`))],
                    [w => w.res.getAttribute('type')],
                    [w => w.pres.getAttribute(w.res === 'checkbox' ? 'checked' : 'value')],
                ])
                .then(value => {
                    values[field] = value;
                    next();
                })
                .catch(() => next());
            });
            q.once('done', () => resolve(values));
        });
    }

    /**
     * Find elements.
     *
     * @param {object|By} data Selector
     * @param {WebElement} data.el Parent element
     * @param {By} data.data Selector
     * @returns {Promise<WebElement[]>}
     */
    findElements(data) {
        if (data.el && data.data) {
            return data.el.findElements(data.data);
        }
        return this.getDriver().findElements(data);
    }

    /**
     * Find element.
     *
     * @param {object|By} data Selector
     * @param {WebElement} data.el Parent element
     * @param {By} data.data Selector
     * @returns {Promise<WebElement>}
     */
    findElement(data) {
        if (data.el && data.data) {
            return data.el.findElement(data.data);
        }
        return this.getDriver().findElement(data);
    }

    /**
     * Perform click.
     *
     * @param {object|By} data Selector
     * @param {WebElement} data.el Parent element
     * @param {By} data.data Selector
     * @returns {Promise<WebElement>}
     */
    click(data) {
        return this.works([
            [w => this.findElement(data)],
            [w => w.getRes(0).click()],
            [w => Promise.resolve(w.getRes(0))],
        ]);
    }

    /**
     * Wait an element to present for defined timeout.
     *
     * @param {By} data Selector
     * @returns {Promise<WebElement>}
     */
    waitFor(data) {
        return this.works([
            [w => this.getDriver().wait(until.elementLocated(data), this.timeout)],
        ]);
    }

    /**
     * Wait an element to present and then perform click.
     *
     * @param {By} data Selector
     * @returns {Promise<WebElement>}
     */
    waitAndClick(data) {
        return this.works([
            [w => this.waitFor(data)],
            [w => w.getRes(0).click()],
            [w => Promise.resolve(w.getRes(0))],
        ]);
    }

    /**
     * Get element texts.
     *
     * @param {By[]} items Selectors
     * @param {WebElement} parent Parent element
     * @returns {Promise<string[]>}
     */
    getText(items, parent) {
        if (!parent) {
            parent = this.getDriver();
        }
        return new Promise((resolve, reject) => {
            const result = [];
            const q = new Queue(items, item => {
                this.works([
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

    /**
     * Show alert dialogue.
     *
     * @param {string} message Alert message
     * @returns {Promise}
     */
    alert(message) {
        return this.getDriver().executeScript(`alert("${message}")`);
    }

    /**
     * Check if error is not expected error.
     *
     * @param {Error} err Error to check
     * @returns {boolean}
     */
    static isErr(err) {
        let result = err ? true : false;
        if (result) {
            expectedErrors.forEach(e => {
                if (err instanceof e) {
                    result = false;
                    return true;
                }
            });
        }
        return result;
    }

    /**
     * Register an expected error.
     *
     * @param {Error} err Error to expect
     */
    static expectErr(err) {
        if (expectedErrors.indexOf(err) < 0) {
            expectedErrors.push(err);
        }
    }
}

module.exports = WebRobot;