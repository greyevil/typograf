/**
 * @constructor
 * @param {Object} [prefs]
 * @param {string} [prefs.lang] Language rules
 * @param {string} [prefs.mode] HTML entities as: 'default' - UTF-8, 'digit' - &#160;, 'name' - &nbsp;
 * @param {string|Array[string]} [prefs.enable] Enable rules
 * @param {string|Array[string]} [prefs.disable] Disable rules
 */
function Typograf(prefs) {
    this._prefs = typeof prefs === 'object' ? prefs : {};

    this._settings = {};
    this._enabledRules = {};

    this._replaceLabel = this._replaceLabel.bind(this);
    this._pasteLabel = this._pasteLabel.bind(this);
    this._initSafeTags();

    this._rules.forEach(this._prepareRule, this);

    this._prefs.disable && this.disable(this._prefs.disable);
    this._prefs.enable && this.enable(this._prefs.enable);
}

/**
 * Add a rule.
 *
 * @static
 * @param {Object} rule
 * @param {string} rule.name Name of rule
 * @param {Function} rule.func Processing function
 * @param {number} [rule.sortIndex] Sorting index for rule
 * @param {boolean} [rule.disabled] Rule is disabled by default
 * @param {Object} [rule.settings] Settings for rule
 * @return {Typograf} this
 */
Typograf.rule = function(rule) {
    rule.enabled = rule.enabled === false || rule.disabled === true ? false : true;
    rule._lang = rule.name.split('/')[0];
    rule.sortIndex = rule.sortIndex || /* istanbul ignore next */ 0;

    Typograf.prototype._rules.push(rule);

    if(Typograf._needSortRules) {
        this._sortRules();
    }

    return this;
};

/**
 * Add internal rule.
 * Internal rules are executed before main.
 *
 * @static
 * @param {Object} rule
 * @param {string} rule.name Name of rule
 * @param {Function} rule.func Processing function
 * @param {string} [rule.sortIndex] Sorting index for rule
 * @return {Typograf} this
 */
Typograf.innerRule = function(rule) {
    Typograf.prototype._innerRules.push(rule);

    rule._lang = rule.name.split('/')[0];
    rule.sortIndex = rule.sortIndex || 0;

    if(Typograf._needSortRules) {
        this._sortInnerRules();
    }

    return this;
};

/**
 * Add data for use in rules.
 *
 * @static
 * @param {string} key
 * @param {*} [value]
 * @return {*}
 */
Typograf.data = function(key, value) {
    if(arguments.length === 1) {
        return Typograf._data[key];
    } else {
        Typograf._data[key] = value;
    }
};

Typograf._data = {};

Typograf._sortRules = function() {
    Typograf.prototype._rules.sort(function(a, b) {
        return a.sortIndex > b.sortIndex ? 1 : -1;
    });
};

Typograf._sortInnerRules = function() {
    Typograf.prototype._innerRules.sort(function(a, b) {
        return a.sortIndex > b.sortIndex ? 1 : -1;
    });
};

Typograf._quot = function(text, settings) {
    var letters = '\\d' + this.letters() + '\u0301',
        privateLabel = Typograf._privateLabel,
        lquot = settings.lquot,
        rquot = settings.rquot,
        lquot2 = settings.lquot2,
        rquot2 = settings.rquot2,
        quotes = '[«»„“”"]',
        phrase = '[' + letters + ')!?.:;#*,]*?',
        reL = new RegExp('"([…' + letters + '])', 'gi'),
        reR = new RegExp('(' + phrase + ')"(' + phrase + ')', 'gi'),
        reL1 = new RegExp(rquot2 + '([^' + lquot2 + rquot2 + ']*?)' + rquot2, 'g'),
        reR1 = new RegExp(lquot2 + '([^' + lquot2 + rquot2 + ']*?)' + lquot2, 'g'),
        reL2 = new RegExp(lquot2, 'g'),
        reR2 = new RegExp(rquot2, 'g'),
        reQuotes = new RegExp(quotes, 'g'),
        reFirstQuote = new RegExp('^(\s)?(' + quotes + ')', 'g'),
        reOpeningTag = new RegExp('(^|\\s)' + quotes + privateLabel, 'g'),
        reClosingTag = new RegExp(privateLabel + quotes + '([\s!?.:;#*,]|$)', 'g');

    text = text
        .replace(reQuotes, '"')
        .replace(reL, lquot2 + '$1') // Opening quote
        .replace(reR, '$1' + rquot2 + '$2') // Closing quote
        .replace(reOpeningTag, '$1' + lquot2 + privateLabel)
        .replace(reClosingTag, privateLabel + rquot2 + '$1')
        .replace(reFirstQuote, '$1' + lquot2)
        .replace(new RegExp('(^|\\w|\\s)' + rquot2 + lquot2, 'g'),
            '$1' + lquot2 + lquot2); // Fixed for the case »« at the beginning of the text

    if(lquot === lquot2 && rquot === rquot2) {
        text = text
            .replace(reL2, lquot)
            .replace(reR2, rquot)
            // ««Энергия» Синергия» -> «Энергия» Синергия»
            .replace(new RegExp(lquot + lquot, 'g'), lquot)
            // «Энергия «Синергия»» -> «Энергия «Синергия»
            .replace(new RegExp(rquot + rquot, 'g'), rquot);
    } else {
        text = text
            .replace(reL1, rquot2 + '$1' + rquot)
            .replace(reR1, lquot + '$1' + lquot2);

        if(text.search(lquot) === -1 || text.search(rquot) === -1) {
            text = text
                .replace(reL2, lquot)
                .replace(reR2, rquot);
        }
    }

    return text;
};

Typograf._langs = ['en', 'ru'];
Typograf._privateLabel = '\uDBFF';

Typograf.prototype = {
    constructor: Typograf,
    /**
     * Execute typographical rules for text.
     *
     * @param {string} text
     * @param {Object} [prefs]
     * @param {string} [prefs.lang] Language rules
     * @param {string} [prefs.mode] Type HTML entities
     * @return {string}
     */
    execute: function(text, prefs) {
        prefs = prefs || {};

        var that = this,
            lang = prefs.lang || this._prefs.lang || 'common',
            rulesForQueue = {},
            innerRulesForQueue = {},
            mode = typeof prefs.mode === 'undefined' ? this._prefs.mode : prefs.mode,
            iterator = function(rule) {
                var rlang = rule._lang;

                if((rlang === 'common' || rlang === lang) && this.enabled(rule.name)) {
                    this._onBeforeRule && this._onBeforeRule(text);
                    text = rule.func.call(this, text, this._settings[rule.name]);
                    this._onAfterRule && this._onAfterRule(text);
                }
            },
            executeRulesForQueue = function(queue) {
                innerRulesForQueue[queue] && innerRulesForQueue[queue].forEach(iterator, that);
                rulesForQueue[queue] && rulesForQueue[queue].forEach(iterator, that);
            };

        this._lang = lang;

        text = '' + text;

        if(!text) {
            return '';
        }

        text = this._fixLineEnd(text);

        this._innerRules.forEach(function(rule) {
            var q = rule.queue;
            innerRulesForQueue[q] = innerRulesForQueue[q] || [];
            innerRulesForQueue[q].push(rule);
        }, this);

        this._rules.forEach(function(rule) {
            var q = rule.queue;
            rulesForQueue[q] = rulesForQueue[q] || [];
            rulesForQueue[q].push(rule);
        }, this);

        this._isHTML = text.search(/<[a-z!]/i) !== -1;

        executeRulesForQueue('start');

        if(this._isHTML) {
            text = this._hideSafeTags(text);
        }

        text = this._utfication(text);
        executeRulesForQueue();
        text = this._modification(text, mode);

        if(this._isHTML) {
            text = this._showSafeTags(text);
        }

        executeRulesForQueue('end');

        this._lang = null;
        this._isHTML = null;

        return text;
    },
    /**
     * Get/set a setting
     *
     * @param {string} ruleName
     * @param {string} setting
     * @param {*} [value]
     * @return {*}
     */
    setting: function(ruleName, setting, value) {
        if(arguments.length <= 2) {
            return this._settings[ruleName] && this._settings[ruleName][setting];
        } else {
            this._settings[ruleName] = this._settings[ruleName] || {};
            this._settings[ruleName][setting] = value;

            return this;
        }
    },
    /**
     * Is enabled a rule.
     *
     * @param {string} ruleName
     * @return {boolean}
     */
    enabled: function(ruleName) {
        return this._enabledRules[ruleName];
    },
    /**
     * Is disabled a rule.
     *
     * @param {string} ruleName
     * @return {boolean}
     */
    disabled: function(ruleName) {
        return !this._enabledRules[ruleName];
    },
    /**
     * Enable a rule.
     *
     * @param {string|Array[string]} ruleName
     * @return {Typograf} this
     */
    enable: function(ruleName) {
        return this._enable(ruleName, true);
    },
    /**
     * Disable a rule.
     *
     * @param {string|Array[string]} ruleName
     * @return {Typograf} this
     */
    disable: function(ruleName) {
        return this._enable(ruleName, false);
    },
    /**
     * Add safe tag.
     *
     * @param {string} startTag
     * @param {string} endTag
     */
    addSafeTag: function(startTag, endTag) {
        this._safeTags.push([startTag, endTag]);
    },
    /**
     * Get a string of characters with range for current language.
     * This is used in regular expressions in rules.
     *
     * @return {string}
     */
    letters: function() {
        var lang = this._lang || this._prefs.lang,
            commonLetter = Typograf.data('common/letter'),
            langLetter = Typograf.data(lang + '/letter');

        return commonLetter === langLetter || !lang ? commonLetter : commonLetter + langLetter;
    },
    _fixLineEnd: function(text) {
        return text
            .replace(/\r\n/g, '\n') // Windows
            .replace(/\r/g, '\n'); // MacOS
    },
    _prepareRule: function(rule) {
        var name = rule.name;
        this._settings[name] = rule.settings || {};
        this._enabledRules[name] = rule.enabled;
    },
    _enable: function(rule, enabled) {
        if(Array.isArray(rule)) {
            rule.forEach(function(el) {
                this._enableByMask(el, enabled);
            }, this);
        } else {
            this._enableByMask(rule, enabled);
        }

        return this;
    },
    _enableByMask: function(rule, enabled) {
        var re;
        if(rule.search(/\*/) !== -1) {
            re = new RegExp(rule
                .replace(/\//g, '\\\/')
                .replace(/\*/g, '.*'));

            this._rules.forEach(function(el) {
                var name = el.name;
                if(re.test(name)) {
                    this._enabledRules[name] = enabled;
                }
            }, this);
        } else {
            this._enabledRules[rule] = enabled;
        }
    },
    _rules: [],
    _innerRules: [],
    _initSafeTags: function() {
        this._safeTags = [
            ['<!--', '-->'],
            ['<!ENTITY', '>'],
            ['<!DOCTYPE', '>'],
            ['<\\?xml', '\\?>'],
            ['<!\\[CDATA\\[', '\\]\\]>']
        ];

        [
            'code',
            'kbd',
            'object',
            'pre',
            'samp',
            'script',
            'style',
            'var'
        ].forEach(function(tag) {
            this._safeTags.push(['<' + tag + '(\\s[^>]*?)?>', '</' + tag + '>']);
        }, this);
    },
    _hideSafeTags: function(text) {
        this._hiddenSafeTags = {};

        this._iLabel = 0;

        this._safeTags.forEach(function(tag) {
            var re = new RegExp(tag[0] + '[^]*?' + tag[1], 'gi');
            text = text.replace(re, this._pasteLabel);
        }, this);

        return this._hideHTMLTags(text);
    },
    _getPrivateLabel: function(i) {
        var label = Typograf._privateLabel;
        return label + 'tf' + i + label;
    },
    _pasteLabel: function(match) {
        var key = this._getPrivateLabel(this._iLabel);
        this._hiddenSafeTags[key] = match;
        this._iLabel++;

        return key;
    },
    _replaceLabel: function(match) {
        return this._hiddenSafeTags[match];
    },
    _hideHTMLTags: function(text) {
        return text.replace(/<[a-z\/][^]*?>/gi, this._pasteLabel);
    },
    _showSafeTags: function(text) {
        var label = Typograf._privateLabel,
            reReplace = new RegExp(label + 'tf\\d+' + label, 'g'),
            reSearch = new RegExp(label + 'tf\\d');
        for(var i = 0; i < this._safeTags.length; i++) {
            text = text.replace(reReplace, this._replaceLabel);
            if(text.search(reSearch) === -1) {
                break;
            }
        }

        delete this._hiddenSafeTags;

        return text;
    },
    _utfication: function(text) {
        if(text.search(/&#/) !== -1) {
            text = this._decHexToUtf(text);
        }

        if(text.search(/&[a-z]/i) !== -1) {
            this.entities.forEach(function(entity) {
                text = text.replace(entity[3], entity[2]);
            });
        }

        return text;
    },
    _decHexToUtf: function(text) {
        return text
            .replace(/&#(\d{1,6});/gi, function($0, $1) {
                return String.fromCharCode(parseInt($1, 10));
            })
            .replace(/&#x([\da-f]{1,6});/gi, function($0, $1) {
                return String.fromCharCode(parseInt($1, 16));
            });
    },
    _modification: function(text, mode) {
        if(mode === 'name' || mode === 'digit') {
            var index = mode === 'name' ? 0 : 1;
            this.entities.forEach(function(entity) {
                if(entity[index]) {
                    text = text.replace(entity[4], entity[index]);
                }
            });
        }

        return text;
    }
};
