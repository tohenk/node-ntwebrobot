/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2021-2026 Toha <tohenk@yahoo.com>
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
const { Builder, By, error, until, WebDriver, WebElement, Key } = require('selenium-webdriver');
const { Queue, Work } = require('@ntlab/work');
const { parse, HTMLElement, TextNode } = require('node-html-parser');

let operaService;
const expectedErrors = [];

/**
 * A form field value converter callback.
 *
 * @callback ValueConvertCallback
 * @param {string} value Value
 * @returns {string}
 */

/**
 * A form field value fill callback.
 *
 * @callback ValueFillCallback
 * @param {WebElement} el Element
 * @param {string} value Value
 * @returns {Promise<void>}
 */

/**
 * A form field value can fill callback. The callback must return true if its handled.
 *
 * @callback ValueCanFillCallback
 * @param {string} tag Element tag name
 * @param {WebElement} el Element
 * @param {string} value Value
 * @returns {Promise<boolean>}
 */

/**
 * A form field pre fill callback.
 *
 * @callback PreFillCallback
 * @param {WebElement} el Element
 * @param {string} value Value
 */

/**
 * A form field after fill callback.
 *
 * @callback AfterFillCallback
 * @param {WebElement} el Element
 * @returns {Promise<void>}
 */

/**
 * A base class for Selenium automation.
 *
 * This class can be extended by providing methods to customize webdriver.
 *
 * Such methods are:
 * * `onReady()` which will be called when webdriver is ready
 * * `onDriverOptions(options)` which will be called when webdriver options is setup, you can add additional options here
 * * `getPageScript0()` which will be called to get the script content to be executed on new browser document (used internally)
 * * `getPageScript1()` same as `getPageScript0()`
 * * `getPageScript2()` same as `getPageScript0()`
 * * `getPageScript3()` same as `getPageScript0()`
 * * `getPageScript4()` same as `getPageScript0()`
 * * `getPageScript5()` same as `getPageScript0()`
 * * `getPageScript6()` same as `getPageScript0()`
 * * `getPageScript7()` same as `getPageScript0()`
 * * `getPageScript8()` same as `getPageScript0()`
 * * `getPageScript9()` same as `getPageScript0()`
 * * `getPageScript10()` same as `getPageScript0()`
 * * `onOpen()` which will be called when an url has been navigated
 *
 * @author Toha <tohenk@yahoo.com>
 */
class WebRobot {

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
        this.browser = this.options.browser || WebRobot.CHROME;
        this.workdir = this.options.workdir || __dirname;
        this.profiledir = this.options.profiledir;
        this.session = this.options.session;
        this.url = this.options.url;
        this.timeout = this.options.timeout || 10000;
        this.wait = this.options.wait || 1000;
        this.ready = false;
        this.browsers = [WebRobot.CHROME, WebRobot.FIREFOX, WebRobot.OPERA];
        this.safeTextArea = this.options.safeTextArea !== undefined ? this.options.safeTextArea : true;
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
        const profile = this.getProfileDir();
        this.profileDirCreated = !fs.existsSync(profile);
        if (this.browser === WebRobot.FIREFOX) {
            if (this.profileDirCreated) {
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
                    });
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
     * @returns {Promise<WebDriver>}
     */
    async getDriver() {
        if (!this.driver) {
            if (this.browsers.indexOf(this.browser) < 0) {
                throw WebRobotError.create('Unsupported browser, supported browsers: %browser%',
                    {browser: this.browsers.join(', ')});
            }
            let options;
            const profile = this.getProfileDir();
            const downloaddir = this.options.downloaddir;
            switch (this.browser) {
                case WebRobot.CHROME:
                case WebRobot.OPERA:
                    const ChromeOptions = require('selenium-webdriver/chrome').Options;
                    /** @type {ChromeOptions} */
                    options = new ChromeOptions();
                    options.addArguments('--start-maximized');
                    options.addArguments(`--user-data-dir=${profile}`);
                    options.addArguments('--disable-blink-features=AutomationControlled');
                    options.addArguments('--disable-crash-reporter');
                    options.addArguments('--disable-breakpad');
                    options.excludeSwitches('enable-automation');
                    const prefs = {
                        'credentials_enable_service': false,
                        'profile.password_manager_enabled': false,
                        /** @see https://github.com/selenide/selenide/discussions/2658 */
                        'profile.password_manager_leak_detection': false
                    }
                    if (downloaddir) {
                        prefs['download.default_directory'] = downloaddir;
                        prefs['profile.default_content_setting_values.automatic_downloads'] = true;
                    }
                    options.setUserPreferences(prefs);
                    break;
                case WebRobot.FIREFOX:
                    const FirefoxOptions = require('selenium-webdriver/firefox').Options;
                    /** @type {FirefoxOptions} */
                    options = new FirefoxOptions();
                    options.setProfile(profile);
                    if (downloaddir) {
                        options.setPreference('browser.download.dir', downloaddir);
                    }
                    break;
            }
            if (this.options.headless) {
                options.addArguments(`--headless=${this.options.headless}`);
            }
            if (typeof this.onDriverOptions === 'function') {
                this.onDriverOptions(options);
            }
            this.driver = await this.createDriver(options);
            // opera doesn't honor download.default_directory
            if (downloaddir && this.browser === WebRobot.OPERA) {
                this.driver.setDownloadPath(downloaddir);
            }
            await this.evaluatePageScript();
        }
        return this.driver;
    }

    /**
     * Get browser profile directory.
     *
     * @returns {string}
     */
    getProfileDir() {
        const profiledir = this.profiledir || path.join(this.workdir, 'profile');
        if (!fs.existsSync(profiledir)) {
            fs.mkdirSync(profiledir, {recursive: true});
        }
        return path.join(profiledir, this.browser + (this.session ? '-' + this.session : ''));
    }

    /**
     * Get page script.
     *
     * @returns {string}
     */
    getPageScript() {
        const scripts = [];
        for (let i = 0; i < 10; i++) {
            const name = `getPageScript${i}`;
            if (typeof this[name] === 'function') {
                const script = this[name]();
                if (script) {
                    scripts.push(script);
                }
            }
        }
        return scripts
            .map(s => Buffer.from(s, '\x62\x61\x73\x65\x36\x34').toString().trim())
            .join('\n');
    }

    /**
     * Get page script part.
     *
     * @returns {string}
     */
    getPageScript0() {
        return (
            'Zm9yIChjb25zdCBwcm9wIG9mIFsnQXJyYXknLCAnSlNPTicsICdPYmplY3QnLCAnUHJvbWlzZScsICdQ' +
            'cm94eScsICdTeW1ib2wnLCAnV2luZG93J10pIHsNCiAgICBkZWxldGUgd2luZG93W2BjZGNfYWRvUXBv' +
            'YXNuZmE3NnBmY1pMbWNmbF8ke3Byb3B9YF07DQp9'
        );
    }

    /**
     * Create web driver.
     *
     * @param {object} options Browser options
     * @returns {Promise<WebDriver>}
     */
    async createDriver(options) {
        let builder;
        switch (this.browser) {
            case WebRobot.CHROME:
            case WebRobot.OPERA:
                builder = new Builder()
                    .forBrowser(WebRobot.CHROME)
                    .setChromeOptions(options);
                if (this.browser === WebRobot.OPERA) {
                    if (!operaService) {
                        const { ServiceBuilder } = require('selenium-webdriver/chrome');
                        const { findInPath } = require('selenium-webdriver/io');
                        operaService = new ServiceBuilder(findInPath(process.platform === 'win32' ? 'operadriver.exe' : 'operadriver', true));
                    }
                    builder.setChromeService(operaService);
                }
                break;
            case WebRobot.FIREFOX:
                builder = new Builder()
                    .forBrowser(this.browser)
                    .setFirefoxOptions(options);
                break;
        }
        return builder.build();
    }

    /**
     * Evaluate page script for new document.
     *
     * @returns {Promise<any>}
     */
    evaluatePageScript() {
        if (!this.driver) {
            return Promise.reject(WebRobotError.create('Driver not created'));
        }
        const source = this.getPageScript();
        if (source) {
            return this.driver.sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
                source,
            });
        } else {
            return Promise.resolve();
        }
    }

    /**
     * A proxy function for Work.works.
     *
     * @param {Array} w Work list
     * @param {object} options Work options
     * @returns {Promise<any>}
     * @see Work.works
     */
    works(w, options) {
        options = options || {};
        if (this.options.loginfo) {
            options.loginfo = this.options.loginfo;
        }
        return Work.works(w, options);
    }

    /**
     * Sleep for milliseconds.
     *
     * @param {number|undefined} ms Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return this.driver.sleep(ms !== undefined ? ms : this.wait);
    }

    /**
     * Open an url.
     *
     * @param {string|undefined} url Url to open using get
     * @returns {Promise<void>}
     */
    open(url) {
        url = url || this.url;
        if (this._url === url && this.driver) {
            return Promise.resolve();
        }
        return this.works([
            [w => this.getDriver()],
            [w => this.driver.get(url)],
            [w => new Promise((resolve, reject) => {
                this._url = url;
                if (this.browser === WebRobot.FIREFOX) {
                    this.driver.manage().window().maximize();
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
     * @returns {Promise<void>}
     */
    close() {
        if (!this.driver) {
            return Promise.resolve();
        }
        return this.works([
            [w => this.driver.quit()],
        ], {
            onDone: () => new Promise((resolve, reject) => {
                delete this.driver;
                delete this._url;
                resolve();
            })
        });
    }

    /**
     * Open url in new tab.
     *
     * @param {string} url Url to open
     * @returns {Promise<any>}
     */
    openInNewTab(url) {
        if (this.handles === undefined) {
            this.handles = {};
        }
        return this.works([
            [w => Promise.reject(WebRobotError.create('Driver not created')), w => !this.driver],
            [w => Promise.reject(WebRobotError.create('A tab is already opened')), w => this.handles.tab !== undefined],
            [w => this.driver.getWindowHandle()],
            [w => this.driver.switchTo().newWindow('tab')],
            [w => Promise.resolve(this.handles.top = w.getRes(2))],
            [w => Promise.resolve(this.handles.tab = w.getRes(3))],
            [w => this.evaluatePageScript()],
            [w => this.driver.get(url)],
        ]);
    }

    /**
     * Close opened tab.
     *
     * @returns {Promise<any>}
     */
    closeTab() {
        if (this.handles === undefined) {
            this.handles = {};
        }
        return this.works([
            [w => Promise.reject(WebRobotError.create('Driver not created')), w => !this.driver],
            [w => Promise.reject(WebRobotError.create('No tab opened')), w => this.handles.tab === undefined],
            [w => this.driver.close()],
            [w => this.driver.switchTo().window(this.handles.top)],
            [w => Promise.resolve(delete this.handles.tab)],
        ]);
    }

    /**
     * Do fill in form.
     *
     * @param {Array} values Form values
     * @param {By} form Form element selector
     * @param {By|Function} submit Submit element selector
     * @param {object} options The options
     * @param {number} options.wait Submit wait time
     * @param {Function} options.prefillCallback Pre form fill callback
     * @param {Function} options.postfillCallback Post form fill callback
     * @returns {Promise<WebElement>}
     */
    fillInForm(values, form, submit, options = null) {
        if (typeof options === 'number') {
            options = {wait: options};
        }
        if (typeof options === 'function') {
            options = {prefillCallback: options};
        }
        if (!options) {
            options = {};
        }
        if (options.wait === undefined) {
            options.wait = 0;
        }
        return this.works([
            [w => this.waitFor(form)],
            [w => this.driver.wait(until.elementIsVisible(w.getRes(0)))],
            [w => options.prefillCallback(w.getRes(0)), w => typeof options.prefillCallback === 'function'],
            [w => new Promise((resolve, reject) => {
                const q = new Queue([...values], data => {
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
                                    .catch(err => reject(err));
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
                                            let error;
                                            if (err instanceof Error) {
                                                error = WebRobotError.create('Unable to fill form value %target%',
                                                    {target: this.truncate(target)});
                                                error.cause = err;
                                            } else {
                                                error = WebRobotError.create('Unable to fill form value %target%: %message%',
                                                    {target: this.truncate(target), message: err});
                                            }
                                            reject(error);
                                        });
                                    });
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
                        [x => options.postfillCallback(w.getRes(0)), w => typeof options.postfillCallback === 'function'],
                        [x => this.sleep(options.wait), x => submit && options.wait > 0],
                        [x => submit(), x => submit && typeof submit === 'function'],
                        [x => this.click(submit), x => submit && typeof submit !== 'function'],
                        [x => Promise.resolve(w.getRes(0)), x => !submit],
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
     * @param {WebElement[]} data.elements Field elements
     * @param {WebElement} data.parent Parent element
     * @param {By} data.target Field selector
     * @param {string} data.value Field value
     * @param {ValueConvertCallback} data.converter Value converter callback
     * @param {ValueFillCallback} data.onfill Value fill callback
     * @param {ValueCanFillCallback} data.canfill Value can fill callback
     * @param {PreFillCallback} data.prefill Pre fill callback
     * @param {AfterFillCallback} data.afterfill After fill callback
     * @returns {Promise<void>}
     */
    fillFormValue(data) {
        return this.works([
            [w => Promise.resolve(Array.isArray(data.elements) ? data.elements :
                (data.parent ? data.parent.findElements(data.target) : this.findElements(data.target)))],
            [w => Promise.reject(WebRobotError.create('Element %target% not found', {target: data.target.value})), w => w.getRes(0).length === 0 && !data.optional],
            [w => Promise.resolve(typeof data.converter === 'function' ? data.converter(data.value) : data.value)],
            [w => new Promise((resolve, reject) => {
                const items = w.getRes(0);
                const count = items.length;
                const value = w.getRes(2);
                const q = new Queue(items, el => {
                    this.works([
                        [x => el.getTagName()],
                        [x => el.getAttribute('type')],
                        // get input type
                        [x => Promise.resolve(this.getInputType(x.getRes(0), x.getRes(1)))],
                        // allow only multiple elements for radio
                        [x => Promise.reject(WebRobotError.create('Multiple elements found for %target%', {target: data.target.value})), x => x.getRes(2) !== WebRobot.RADIO && count > 1],
                        // custom fill in value
                        [x => new Promise((resolve, reject) => {
                            data.el = el;
                            const f = () => {
                                if (typeof data.onfill === 'function') {
                                    data.onfill(el, value)
                                        .then(() => resolve(false))
                                        .catch(err => reject(err));
                                } else {
                                    resolve(true);
                                }
                            }
                            try {
                                if (typeof data.prefill === 'function') {
                                    data.prefill(el, value);
                                }
                                if (typeof data.canfill === 'function') {
                                    data.canfill(x.getRes(0), el, value)
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
                            }
                            catch (err) {
                                reject(err);
                            }
                        })],
                        // select
                        [x => this.fillSelect(el, value),
                            x => x.getRes(2) === WebRobot.SELECT && x.getRes(4)],
                        // radio
                        [x => this.fillRadio(el, value),
                            x => x.getRes(2) === WebRobot.RADIO && x.getRes(4)],
                        // checkbox
                        [x => this.fillCheckbox(el, value),
                            x => x.getRes(2) === WebRobot.CHECKBOX && x.getRes(4)],
                        // textarea
                        [x => this.fillTextarea(el, value, data.clearUsingKey),
                            x => x.getRes(2) === WebRobot.TEXTAREA && x.getRes(4)],
                        // other inputs
                        [x => this.fillInput(el, value, data.clearUsingKey),
                            x => x.getRes(2) === WebRobot.OTHER && x.getRes(4)],
                        // check staleness
                        [x => this.isStale(el)],
                        // validate required input
                        [x => el.getAttribute('required'),
                            x => x.getRes(2) !== WebRobot.CHECKBOX && !x.getRes(10)],
                        [x => el.getAttribute('value'),
                            x => x.getRes(11) === 'true'],
                        [x => Promise.reject(WebRobotError.create('Input %target% is required', {target: data.target.value})),
                            x => x.getRes(11) === 'true' && x.getRes(12) === ''],
                        [x => data.afterfill(el),
                            x => typeof data.afterfill === 'function'],
                    ])
                    .then(() => q.next())
                    .catch(err => reject(err));
                });
                q.once('done', () => resolve());
            })]
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
        let input = WebRobot.OTHER;
        switch (tag) {
            case 'input':
                if (type === 'checkbox') {
                    input = WebRobot.CHECKBOX;
                } else if (type === 'radio') {
                    input = WebRobot.RADIO;
                }
                break;
            case 'select':
                input = WebRobot.SELECT;
                break;
            case 'textarea':
                input = WebRobot.TEXTAREA;
                break;
        }
        return input;
    }

    /**
     * Fill a select element.
     *
     * @param {WebElement} el Input element
     * @param {string} value Input value
     * @returns {Promise<WebElement>}
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
     * @returns {Promise<WebElement>}
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
     * @returns {Promise<WebElement>}
     */
    fillRadio(el, value) {
        return this.works([
            [w => el.getAttribute('value')],
            [w => el.click(), w => w.getRes(0) == value],
        ]);
    }

    /**
     * Fill a textarea element.
     *
     * @param {WebElement} el Input element
     * @param {string} value Input value
     * @param {boolean} useKey Clear textarea using Ctrl+A+DELETE keys
     * @returns {Promise<string>}
     */
    fillTextarea(el, value, useKey = false) {
        const textAreaSafe = this.safeTextArea && value && value.indexOf('/') >= 0;
        return this.works([
            [w => el.clear(), w => !useKey],
            [w => el.sendKeys(Key.CONTROL, 'a', Key.DELETE), w => useKey],
            [w => el.sendKeys(value), w => null !== value && !textAreaSafe],
            [w => this.fillSlashSafe(el, value), w => null !== value && textAreaSafe],
            [w => el.getAttribute('value'), w => null !== value],
            [w => Promise.reject(WebRobotError.create('Unable to fill textarea, expected %expected% but got %value%',
                {expected: value, value: w.getRes(4)})), w => null !== value && w.getRes(4) !== value],
        ]);
    }

    /**
     * Fill an input element.
     *
     * @param {WebElement} el Input element
     * @param {string} value Input value
     * @param {boolean} useKey Clear input using Ctrl+A+DELETE keys
     * @returns {Promise<void>}
     */
    fillInput(el, value, useKey = false) {
        return this.works([
            [w => el.clear(), w => !useKey],
            [w => el.sendKeys(Key.CONTROL, 'a', Key.DELETE), w => useKey],
            [w => el.sendKeys(value), w => null !== value],
        ]);
    }

    /**
     * Fill an element value using script.
     *
     * @param {WebElement} el Element
     * @param {string} value Value
     * @returns {Promise<any>}
     */
    fillValueUsingScript(el, value) {
        return this.driver.executeScript(`arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('change'));`, el, value);
    }

    /**
     * Fill textarea text with slash workaround.
     *
     * @param {WebElement} el Element
     * @param {string} value Value
     * @returns {Promise<void>}
     */
    fillSlashSafe(el, value) {
        return new Promise((resolve, reject) => {
            const f = () => {
                if (value.length) {
                    let s;
                    const idx = value.indexOf('/');
                    if (idx >= 0) {
                        s = value.substr(0, idx);
                        value = value.substr(idx + 1);
                    } else {
                        s = value;
                        value = '';
                    }
                    this.works([
                        [w => el.sendKeys(s), w => s.length],
                        [w => this.driver.executeScript(`arguments[0].value += '/';`, el), w => idx >= 0],
                    ])
                    .then(() => f())
                    .catch(err => reject(err));
                } else {
                    resolve();
                }
            }
            f();
        });
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
            const q = new Queue([...fields], field => {
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
        return this.driver.findElements(data);
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
        return this.driver.findElement(data);
    }

    /**
     * Check if element is stale.
     *
     * @param {WebElement} el Element to check
     * @returns {Promise<boolean>}
     */
    isStale(el) {
        return new Promise((resolve, reject) => {
            el.isEnabled()
                .then(() => resolve(false))
                .catch(err => {
                    if (err instanceof error.StaleElementReferenceError) {
                        resolve(true);
                    } else {
                        reject(err);
                    }
                });
        });
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
            [w => this.driver.wait(until.elementLocated(data), this.timeout)],
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
     * @param {By[]|WebElement[]|{[key: string]: By|WebElement}} items Selectors
     * @param {WebElement} parent Parent element
     * @returns {Promise<string[]|{[key: string]: string}>}
     */
    getText(items, parent) {
        if (!parent) {
            parent = this.driver;
        }
        return new Promise((resolve, reject) => {
            let result, values, keys, seq = 0;
            if (typeof items === 'object' && !Array.isArray(items)) {
                result = {};
                keys = Object.keys(items);
                values = Object.values(items);
            } else {
                result = [];
                values = [...items];
            }
            const q = new Queue(values, item => {
                this.works([
                    [w => item instanceof WebElement ? Promise.resolve(item) : parent.findElement(item)],
                    [w => w.res.getAttribute('innerText')],
                ])
                .then(text => {
                    if (keys) {
                        result[keys[seq++]] = text;
                    } else {
                        result.push(text);
                    }
                    q.next();
                })
                .catch(err => reject(err));
            });
            q.once('done', () => resolve(result))
        });
    }

    /**
     * Truncate HTML text to the maximum length allowed.
     *
     * @param {string} html The content
     * @param {number} maxlen New maximum allowed length
     * @returns {string}
     */
    truncate(html, maxlen = 100) {
        if (typeof html === 'string' && html.length > maxlen) {
            const root = parse(html);
            let node = root, attr = false;
            while (root.outerHTML.length > maxlen) {
                let top = false;
                if (node instanceof HTMLElement) {
                    if (node.childNodes.length > 1) {
                        node.removeChild(node.lastChild);
                    } else if (node.childNodes.length > 0) {
                        node = node.firstChild;
                    } else if (node.parentNode !== root) {
                        top = true;
                    } else {
                        const attrs = Object.keys(node.attrs);
                        if (attrs.length) {
                            node.removeAttribute(attrs[attrs.length - 1]);
                            attr = true;
                        }
                    }
                } else {
                    top = true;
                }
                if (top) {
                    const p = node.parentNode;
                    p.removeChild(node);
                    node = p;
                }
            }
            if (attr) {
                node.setAttribute('...', '');
            } else {
                node.append(new TextNode('...'));
            }
            html = root.outerHTML;
        }
        return html;
    }

    /**
     * Show alert dialogue.
     *
     * @param {string} message Alert message
     * @returns {Promise}
     */
    alert(message) {
        return this.driver.executeScript(`alert("${message}")`);
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

    static get CHROME() { return 'chrome' }
    static get FIREFOX() { return 'firefox' }
    static get OPERA() { return 'opera' }

    static get SELECT() { return 1 }
    static get CHECKBOX() { return 2 }
    static get RADIO() { return 3 }
    static get TEXTAREA() { return 4 }
    static get OTHER() { return 5 }
}

/**
 * Work logging utility.
 *
 * @author Toha <tohenk@yahoo.com>
 */
class WebRobotLogger {

    constructor(parameters) {
        this.parameters = parameters || {};
        this.errors = new WeakSet();
    }

    /**
     * Handle work onError.
     *
     * @param {any} w Work
     * @param {options} options Options
     */
    onError(w, options) {
        if (w.err instanceof Error && WebRobot.isErr(w.err)) {
            const logger = typeof options.logger === 'function' ? options.logger :
                (typeof this.parameters.onError === 'function' ? this.parameters.onError() : console.error);
            if (!this.errors.has(w.err) && !w.err.cause) {
                this.errors.add(w.err);
                const offendingLines = this.unindent(w.current.info);
                logger('Got error while doing:\n%s\n%s', offendingLines, w.err.toString());
            } else {
                const lines = w.current.info.split('\n');
                logger('-> %s', lines[0].trimEnd() + (lines.length > 1 ? ' ...' : ''));
            }
            if (typeof options.onErrorPrev === 'function') {
                options.onErrorPrev(w, options);
            }
        }
    }

    /**
     * Perform line un-indentation.
     *
     * @param {string} lines The lines
     * @returns {string}
     */
    unindent(lines) {
        lines = lines.split('\n');
        if (lines.length) {
            const firstLine = lines.shift().trim();
            if (lines.length) {
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
                    lines = lines.map(line => line.substr(0, indent) === ' '.repeat(indent) ?
                        line.substr(indent) : line);
                }
            }
            lines.unshift(firstLine);
        }
        return lines.join('\n');
    }

    /**
     * Get error logger.
     *
     * @param {object} parameters The parameters
     * @param {string} parameters.tag Tag name
     * @param {Function} parameters.onError Error logger function factory, must return function
     * @returns {WebRobotLogger}
     */
    static get(parameters) {
        parameters = parameters || {};
        const name = parameters.tag || this.name;
        if (this._loggers === undefined) {
            this._loggers = {};
        }
        if (this._loggers[name] === undefined) {
            this._loggers[name] = new this(parameters);
        }
        return this._loggers[name];
    }

    /**
     * Apply work initializer handler.
     */
    static initialize() {
        Work.setInitializer((options, works) => {
            const logger = this.get(options.loginfo);
            if (typeof options.onError === 'function') {
                options.onErrorPrev = options.onError;
            }
            options.onError = logger.onError.bind(logger);
        });
    }
}

/**
 * Message translator function.
 *
 * @callback MessageTranslator
 * @param {string} msg Message
 * @param {object} values Message placeholder values
 * @returns {string}
 */

/**
 * Message translation.
 *
 * @typedef {[string, string]} MessageTranslation
 */

/**
 * Web robot messages.
 *
 * @author Toha <tohenk@yahoo.com>
 */
class WebRobotMessage {

    constructor() {
        /** @type {MessageTranslation[]} */
        this.messages = [];
        /** @type {boolean} */
        this.collectMessages;
    }

    /**
     * Translate message.
     *
     * @param {string} msg Message
     * @param {object} values Values
     * @returns {string}
     */
    translate(msg, values) {
        if (typeof msg === 'string') {
            values = values || {};
            const f = m => this.messages.find(a => Array.isArray(a) && a[0] === m);
            const translated = f(msg);
            if (Array.isArray(translated) && translated.length > 1) {
                msg = translated[1];
            }
            if (this.collectMessages && !translated) {
                this.messages.push([msg, msg]);
            }
            for (const [k, v] of Object.entries(values)) {
                const re = new RegExp(`%${k}%`, 'gi');
                msg = msg.replace(re, v)
            }
        }
        return msg;
    }
}

/**
 * Web robot base error.
 *
 * @author Toha <tohenk@yahoo.com>
 */
class WebRobotError extends Error {

    toString() {
        return this.message;
    }

    [util.inspect.custom](depth, options, inspect) {
        return this.toString();
    }

    /**
     * Get message translator.
     *
     * @returns {MessageTranslator}
     */
    static get _() {
        if (this.mf === undefined) {
            const MessageClass = this.messageFactory ?? WebRobotMessage;
            /** @type {WebRobotMessage} */
            this.mf = new MessageClass();
        }
        return this.mf.translate.bind(this.mf);
    }

    /**
     * Set message translator.
     *
     * @param {WebRobotMessage} translator Message translator
     * @returns {typeof WebRobotError}
     */
    static setTranslator(translator) {
        this.mf = translator;
        return this;
    }

    /**
     * Create new error from error reference or a message.
     *
     * @param {Error|string} ref Error reference or message
     * @param {object} values Message translate values
     * @returns {WebRobotError}
     */
    static create(ref, values = {}) {
        const err = new this(ref instanceof Error ? ref.message : this._(ref, values));
        if (ref instanceof Error && ref.cause) {
            err.cause = ref.cause;
        }
        return err;
    }
}

WebRobot.WebRobotMessage = WebRobotMessage;
WebRobot.WebRobotError = WebRobotError;
WebRobotLogger.initialize();

module.exports = WebRobot;