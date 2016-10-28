// given a string of css, return a simple rule tree
function parse(text) {
  text = clean(text);
  return parseCss(lex(text), text);
}

// remove stuff we don't care about that may hinder parsing
function clean(cssText) {
  return cssText.replace(RX.comments, '').replace(RX.port, '');
}

// super simple {...} lexer that returns a node tree
function lex(text) {
  let root = {
    start: 0,
    end: text.length
  };
  let n = root;
  for (let i = 0, l = text.length; i < l; i++) {
    if (text[i] === OPEN_BRACE) {
      if (!n.rules) {
        n.rules = [];
      }
      let p = n;
      let previous = p.rules[p.rules.length - 1];
      n = {
        start: i + 1,
        parent: p,
        previous: previous
      };
      p.rules.push(n);
    } else if (text[i] === CLOSE_BRACE) {
      n.end = i + 1;
      n = n.parent || root;
    }
  }
  return root;
}

// add selectors/cssText to node tree
function parseCss(node, text) {
  let t = text.substring(node.start, node.end - 1);
  node.parsedCssText = node.cssText = t.trim();
  if (node.parent) {
    let ss = node.previous ? node.previous.end : node.parent.start;
    t = text.substring(ss, node.start - 1);
    t = _expandUnicodeEscapes(t);
    t = t.replace(RX.multipleSpaces, ' ');
    // TODO(sorvell): ad hoc; make selector include only after last ;
    // helps with mixin syntax
    t = t.substring(t.lastIndexOf(';') + 1);
    let s = node.parsedSelector = node.selector = t.trim();
    node.atRule = (s.indexOf(AT_START) === 0);
    // note, support a subset of rule types...
    if (node.atRule) {
      if (s.indexOf(MEDIA_START) === 0) {
        node.type = types.MEDIA_RULE;
      } else if (s.match(RX.keyframesRule)) {
        node.type = types.KEYFRAMES_RULE;
        node.keyframesName =
          node.selector.split(RX.multipleSpaces).pop();
      }
    } else {
      if (s.indexOf(VAR_START) === 0) {
        node.type = types.MIXIN_RULE;
      } else {
        node.type = types.STYLE_RULE;
      }
    }
  }
  let r$ = node.rules;
  if (r$) {
    for (let i = 0, l = r$.length, r;
      (i < l) && (r = r$[i]); i++) {
      parseCss(r, text);
    }
  }
  return node;
}

// conversion of sort unicode escapes with spaces like `\33 ` (and longer) into
// expanded form that doesn't require trailing space `\000033`
function _expandUnicodeEscapes(s) {
  return s.replace(/\\([0-9a-f]{1,6})\s/gi, function() {
    let code = arguments[1],
      repeat = 6 - code.length;
    while (repeat--) {
      code = '0' + code;
    }
    return '\\' + code;
  });
}

// stringify parsed css.
function stringify(node, preserveProperties, text) {
  text = text || '';
  // calc rule cssText
  let cssText = '';
  if (node.cssText || node.rules) {
    let r$ = node.rules;
    if (r$ && !_hasMixinRules(r$)) {
      for (let i = 0, l = r$.length, r;
        (i < l) && (r = r$[i]); i++) {
        cssText = stringify(r, preserveProperties, cssText);
      }
    } else {
      cssText = preserveProperties ? node.cssText :
        removeCustomProps(node.cssText);
      cssText = cssText.trim();
      if (cssText) {
        cssText = '  ' + cssText + '\n';
      }
    }
  }
  // emit rule if there is cssText
  if (cssText) {
    if (node.selector) {
      text += node.selector + ' ' + OPEN_BRACE + '\n';
    }
    text += cssText;
    if (node.selector) {
      text += CLOSE_BRACE + '\n\n';
    }
  }
  return text;
}

function _hasMixinRules(rules) {
  return rules[0].selector.indexOf(VAR_START) === 0;
}

function removeCustomProps(cssText) {
  cssText = removeCustomPropAssignment(cssText);
  return removeCustomPropApply(cssText);
}

function removeCustomPropAssignment(cssText) {
  return cssText
    .replace(RX.customProp, '')
    .replace(RX.mixinProp, '');
}

function removeCustomPropApply(cssText) {
  return cssText
    .replace(RX.mixinApply, '')
    .replace(RX.varApply, '');
}

let types = {
  STYLE_RULE: 1,
  KEYFRAMES_RULE: 7,
  MEDIA_RULE: 4,
  MIXIN_RULE: 1000
}

let OPEN_BRACE = '{';
let CLOSE_BRACE = '}';

// helper regexp's
let RX = {
  comments: /\/\*[^*]*\*+([^/*][^*]*\*+)*\//gim,
  port: /@import[^;]*;/gim,
  customProp: /(?:^[^;\-\s}]+)?--[^;{}]*?:[^{};]*?(?:[;\n]|$)/gim,
  mixinProp: /(?:^[^;\-\s}]+)?--[^;{}]*?:[^{};]*?{[^}]*?}(?:[;\n]|$)?/gim,
  mixinApply: /@apply\s*\(?[^);]*\)?\s*(?:[;\n]|$)?/gim,
  varApply: /[^;:]*?:[^;]*?var\([^;]*\)(?:[;\n]|$)?/gim,
  keyframesRule: /^@[^\s]*keyframes/,
  multipleSpaces: /\s+/g
}

let VAR_START = '--';
let MEDIA_START = '@media';
let AT_START = '@';

let nativeShadow = !(window.ShadyDOM && window.ShadyDOM.inUse);

// force shim'd properties
let forceShimCssProperties;

function parseSettings(settings) {
  if (settings) {
    forceShimCssProperties = settings.shimcssproperties;
  }
}

if (window.ShadyCSS) {
  parseSettings(window.ShadyCSS);
} else if (window.WebComponents) {
  parseSettings(window.WebComponents.flags);
}

// chrome 49 has semi-working css vars, check if box-shadow works
// safari 9.1 has a recalc bug: https://bugs.webkit.org/show_bug.cgi?id=155782
let nativeCssVariables = !forceShimCssProperties &&
(!navigator.userAgent.match('AppleWebKit/601') &&
window.CSS && CSS.supports && CSS.supports('box-shadow', '0 0 0 var(--foo)'));

// experimental support for native @apply
function detectNativeApply() {
  let style = document.createElement('style');
  style.textContent = '.foo { @apply --foo }';
  document.head.appendChild(style);
  let nativeCssApply = (style.sheet.cssRules[0].cssText.indexOf('apply') >= 0);
  document.head.removeChild(style);
  return nativeCssApply;
}

let nativeCssApply = false && detectNativeApply();

function toCssText (rules, callback) {
  if (typeof rules === 'string') {
    rules = parse(rules);
  }
  if (callback) {
    forEachRule(rules, callback);
  }
  return stringify(rules, nativeCssVariables);
}

function rulesForStyle(style) {
  if (!style.__cssRules && style.textContent) {
    style.__cssRules = parse(style.textContent);
  }
  return style.__cssRules;
}

// Tests if a rule is a keyframes selector, which looks almost exactly
// like a normal selector but is not (it has nothing to do with scoping
// for example).
function isKeyframesSelector(rule) {
  return rule.parent &&
  rule.parent.type === types.KEYFRAMES_RULE;
}

function forEachRule(node, styleRuleCallback, keyframesRuleCallback, onlyActiveRules) {
  if (!node) {
    return;
  }
  let skipRules = false;
  if (onlyActiveRules) {
    if (node.type === types.MEDIA_RULE) {
      let matchMedia = node.selector.match(rx.MEDIA_MATCH);
      if (matchMedia) {
        // if rule is a non matching @media rule, skip subrules
        if (!window.matchMedia(matchMedia[1]).matches) {
          skipRules = true;
        }
      }
    }
  }
  if (node.type === types.STYLE_RULE) {
    styleRuleCallback(node);
  } else if (keyframesRuleCallback &&
    node.type === types.KEYFRAMES_RULE) {
    keyframesRuleCallback(node);
  } else if (node.type === types.MIXIN_RULE) {
    skipRules = true;
  }
  let r$ = node.rules;
  if (r$ && !skipRules) {
    for (let i=0, l=r$.length, r; (i<l) && (r=r$[i]); i++) {
      forEachRule(r, styleRuleCallback, keyframesRuleCallback, onlyActiveRules);
    }
  }
}

// add a string of cssText to the document.
function applyCss(cssText, moniker, target, contextNode) {
  let style = createScopeStyle(cssText, moniker);
  return applyStyle(style, target, contextNode);
}

function applyStyle(style, target, contextNode) {
  target = target || document.head;
  let after = (contextNode && contextNode.nextSibling) ||
  target.firstChild;
  lastHeadApplyNode = style;
  return target.insertBefore(style, after);
}

function createScopeStyle(cssText, moniker) {
  let style = document.createElement('style');
  if (moniker) {
    style.setAttribute('scope', moniker);
  }
  style.textContent = cssText;
  return style;
}

let lastHeadApplyNode = null;

// Walk from text[start] matching parens
// returns position of the outer end paren
function findMatchingParen(text, start) {
  let level = 0;
  for (let i=start, l=text.length; i < l; i++) {
    if (text[i] === '(') {
      level++;
    } else if (text[i] === ')') {
      if (--level === 0) {
        return i;
      }
    }
  }
  return -1;
}

function processVariableAndFallback(str, callback) {
  // find 'var('
  let start = str.indexOf('var(');
  if (start === -1) {
    // no var?, everything is prefix
    return callback(str, '', '', '');
  }
  //${prefix}var(${inner})${suffix}
  let end = findMatchingParen(str, start + 3);
  let inner = str.substring(start + 4, end);
  let prefix = str.substring(0, start);
  // suffix may have other variables
  let suffix = processVariableAndFallback(str.substring(end + 1), callback);
  let comma = inner.indexOf(',');
  // value and fallback args should be trimmed to match in property lookup
  if (comma === -1) {
    // variable, no fallback
    return callback(prefix, inner.trim(), '', suffix);
  }
  // var(${value},${fallback})
  let value = inner.substring(0, comma).trim();
  let fallback = inner.substring(comma + 1).trim();
  return callback(prefix, value, fallback, suffix);
}

let rx = {
  VAR_ASSIGN: /(?:^|[;\s{]\s*)(--[\w-]*?)\s*:\s*(?:([^;{]*)|{([^}]*)})(?:(?=[;\s}])|$)/gi,
  MIXIN_MATCH: /(?:^|\W+)@apply\s*\(?([^);\n]*)\)?/gi,
  VAR_CONSUMED: /(--[\w-]+)\s*([:,;)]|$)/gi,
  ANIMATION_MATCH: /(animation\s*:)|(animation-name\s*:)/,
  MEDIA_MATCH: /@media[^(]*(\([^)]*\))/,
  IS_VAR: /^--/,
  BRACKETED: /\{[^}]*\}/g,
  HOST_PREFIX: '(?:^|[^.#[:])',
  HOST_SUFFIX: '($|[.:[\\s>+~])'
}

/* Transforms ShadowDOM styling into ShadyDOM styling

* scoping:

  * elements in scope get scoping selector class="x-foo-scope"
  * selectors re-written as follows:

    div button -> div.x-foo-scope button.x-foo-scope

* :host -> scopeName

* :host(...) -> scopeName...

* ::slotted(...) -> scopeName > ...

* ...:dir(ltr|rtl) -> [dir="ltr|rtl"] ..., ...[dir="ltr|rtl"]

* :host(:dir[rtl]) -> scopeName:dir(rtl) -> [dir="rtl"] scopeName, scopeName[dir="rtl"]

*/
let StyleTransformer = {

  // Given a node and scope name, add a scoping class to each node
  // in the tree. This facilitates transforming css into scoped rules.
  dom: function(node, scope, shouldRemoveScope) {
    // one time optimization to skip scoping...
    if (node.__styleScoped) {
      node.__styleScoped = null;
    } else {
      this._transformDom(node, scope || '', shouldRemoveScope);
    }
  },

  _transformDom: function(node, selector, shouldRemoveScope) {
    if (node.classList) {
      this.element(node, selector, shouldRemoveScope);
    }
    let c$ = (node.localName === 'template') ?
      (node.content || node._content).childNodes :
      node.children;
    if (c$) {
      for (let i=0; i<c$.length; i++) {
        this._transformDom(c$[i], selector, shouldRemoveScope);
      }
    }
  },

  element: function(element, scope, shouldRemoveScope) {
    // note: if using classes, we add both the general 'style-scope' class
    // as well as the specific scope. This enables easy filtering of all
    // `style-scope` elements
    if (scope) {
      // note: svg on IE does not have classList so fallback to class
      if (element.classList) {
        if (shouldRemoveScope) {
          element.classList.remove(SCOPE_NAME);
          element.classList.remove(scope);
        } else {
          element.classList.add(SCOPE_NAME);
          element.classList.add(scope);
        }
      } else if (element.getAttribute) {
        let c = element.getAttribute(CLASS);
        if (shouldRemoveScope) {
          if (c) {
            element.setAttribute(CLASS, c.replace(SCOPE_NAME, '')
            .replace(scope, ''));
          }
        } else {
          element.setAttribute(CLASS, (c ? c + ' ' : '') +
          SCOPE_NAME + ' ' + scope);
        }
      }
    }
  },

  elementStyles: function(element, styleRules, callback) {
    let cssBuildType = element.__cssBuild;
    // no need to shim selectors if settings.useNativeShadow, also
    // a shady css build will already have transformed selectors
    // NOTE: This method may be called as part of static or property shimming.
    // When there is a targeted build it will not be called for static shimming,
    // but when the property shim is used it is called and should opt out of
    // static shimming work when a proper build exists.
    let cssText = (nativeShadow || cssBuildType === 'shady') ?
    toCssText(styleRules, callback) :
    this.css(styleRules, element.is, element.extends, callback) + '\n\n';
    return cssText.trim();
  },

  // Given a string of cssText and a scoping string (scope), returns
  // a string of scoped css where each selector is transformed to include
  // a class created from the scope. ShadowDOM selectors are also transformed
  // (e.g. :host) to use the scoping selector.
  css: function(rules, scope, ext, callback) {
    let hostScope = this._calcHostScope(scope, ext);
    scope = this._calcElementScope(scope);
    let self = this;
    return toCssText(rules, function(rule) {
      if (!rule.isScoped) {
        self.rule(rule, scope, hostScope);
        rule.isScoped = true;
      }
      if (callback) {
        callback(rule, scope, hostScope);
      }
    });
  },

  _calcElementScope: function (scope) {
    if (scope) {
      return CSS_CLASS_PREFIX + scope;
    } else {
      return '';
    }
  },

  _calcHostScope: function(scope, ext) {
    return ext ? '[is=' +  scope + ']' : scope;
  },

  rule: function (rule, scope, hostScope) {
    this._transformRule(rule, this._transformComplexSelector,
      scope, hostScope);
  },

  // transforms a css rule to a scoped rule.
  _transformRule: function(rule, transformer, scope, hostScope) {
    // NOTE: save transformedSelector for subsequent matching of elements
    // against selectors (e.g. when calculating style properties)
    rule.selector = rule.transformedSelector =
      this._transformRuleCss(rule, transformer, scope, hostScope);
  },

  _transformRuleCss: function(rule, transformer, scope, hostScope) {
    let p$ = rule.selector.split(COMPLEX_SELECTOR_SEP);
    // we want to skip transformation of rules that appear in keyframes,
    // because they are keyframe selectors, not element selectors.
    if (!isKeyframesSelector(rule)) {
      for (let i=0, l=p$.length, p; (i<l) && (p=p$[i]); i++) {
        p$[i] = transformer.call(this, p, scope, hostScope);
      }
    }
    return p$.join(COMPLEX_SELECTOR_SEP);
  },

  _transformComplexSelector: function(selector, scope, hostScope) {
    let stop = false;
    selector = selector.trim();
    selector = selector.replace(SIMPLE_SELECTOR_SEP, (m, c, s) => {
      if (!stop) {
        let info = this._transformCompoundSelector(s, c, scope, hostScope);
        stop = stop || info.stop;
        c = info.combinator;
        s = info.value;
      }
      return c + s;
    });
    return selector;
  },

  _transformCompoundSelector: function(selector, combinator, scope, hostScope) {
    // replace :host with host scoping class
    let slottedIndex = selector.indexOf(SLOTTED);
    if (selector.indexOf(HOST) >= 0) {
      selector = this._transformHostSelector(selector, hostScope);
    // replace other selectors with scoping class
    } else if (slottedIndex !== 0) {
      selector = scope ? this._transformSimpleSelector(selector, scope) :
        selector;
    }
    // mark ::slotted() scope jump to replace with descendant selector + arg
    // also ignore left-side combinator
    let slotted = false;
    if (slottedIndex >= 0) {
      combinator = '';
      slotted = true;
    }
    // process scope jumping selectors up to the scope jump and then stop
    let stop;
    if (slotted) {
      stop = true;
      if (slotted) {
        // .zonk ::slotted(.foo) -> .zonk.scope > .foo
        selector = selector.replace(SLOTTED_PAREN, (m, paren) => ` > ${paren}`);
      }
    }
    selector = selector.replace(DIR_PAREN, (m, before, dir) =>
      `[dir="${dir}"] ${before}, ${before}[dir="${dir}"]`);
    return {value: selector, combinator, stop};
  },

  _transformSimpleSelector: function(selector, scope) {
    let p$ = selector.split(PSEUDO_PREFIX);
    p$[0] += scope;
    return p$.join(PSEUDO_PREFIX);
  },

  // :host(...) -> scopeName...
  _transformHostSelector: function(selector, hostScope) {
    let m = selector.match(HOST_PAREN);
    let paren = m && m[2].trim() || '';
    if (paren) {
      if (!paren[0].match(SIMPLE_SELECTOR_PREFIX)) {
        // paren starts with a type selector
        let typeSelector = paren.split(SIMPLE_SELECTOR_PREFIX)[0];
        // if the type selector is our hostScope then avoid pre-pending it
        if (typeSelector === hostScope) {
          return paren;
        // otherwise, this selector should not match in this scope so
        // output a bogus selector.
        } else {
          return SELECTOR_NO_MATCH;
        }
      } else {
        // make sure to do a replace here to catch selectors like:
        // `:host(.foo)::before`
        return selector.replace(HOST_PAREN, function(m, host, paren) {
          return hostScope + paren;
        });
      }
    // if no paren, do a straight :host replacement.
    // TODO(sorvell): this should not strictly be necessary but
    // it's needed to maintain support for `:host[foo]` type selectors
    // which have been improperly used under Shady DOM. This should be
    // deprecated.
    } else {
      return selector.replace(HOST, hostScope);
    }
  },

  documentRule: function(rule) {
    // reset selector in case this is redone.
    rule.selector = rule.parsedSelector;
    this.normalizeRootSelector(rule);
    this._transformRule(rule, this._transformDocumentSelector);
  },

  normalizeRootSelector: function(rule) {
    if (rule.selector === ROOT) {
      rule.selector = 'html';
    }
  },

  _transformDocumentSelector: function(selector) {
    return selector.match(SLOTTED) ?
      this._transformComplexSelector(selector, SCOPE_DOC_SELECTOR) :
      this._transformSimpleSelector(selector.trim(), SCOPE_DOC_SELECTOR);
  },

  SCOPE_NAME: 'style-scope'
};

let SCOPE_NAME = StyleTransformer.SCOPE_NAME;
let SCOPE_DOC_SELECTOR = ':not([' + SCOPE_NAME + '])' +
  ':not(.' + SCOPE_NAME + ')';
let COMPLEX_SELECTOR_SEP = ',';
let SIMPLE_SELECTOR_SEP = /(^|[\s>+~]+)((?:\[.+?\]|[^\s>+~=\[])+)/g;
let SIMPLE_SELECTOR_PREFIX = /[[.:#*]/;
let HOST = ':host';
let ROOT = ':root';
let SLOTTED = '::slotted';
// NOTE: this supports 1 nested () pair for things like
// :host(:not([selected]), more general support requires
// parsing which seems like overkill
let HOST_PAREN = /(:host)(?:\(((?:\([^)(]*\)|[^)(]*)+?)\))/;
// similar to HOST_PAREN
let SLOTTED_PAREN = /(?:::slotted)(?:\(((?:\([^)(]*\)|[^)(]*)+?)\))/;
let DIR_PAREN = /(.*):dir\((?:(ltr|rtl))\)/;
let CSS_CLASS_PREFIX = '.';
let PSEUDO_PREFIX = ':';
let CLASS = 'class';
let SELECTOR_NO_MATCH = 'should_not_match';

class StyleInfo {
  static get(node) {
    return node.__styleInfo;
  }
  static set(node, styleInfo) {
    node.__styleInfo = styleInfo;
    return styleInfo;
  }
  constructor(ast, placeholder, ownStylePropertyNames, elementName, typeExtension, cssBuild) {
    this.styleRules = ast || null;
    this.placeholder = placeholder || null;
    this.ownStylePropertyNames = ownStylePropertyNames || [];
    this.overrideStyleProperties = {};
    this.elementName = elementName || '';
    this.cssBuild = cssBuild || '';
    this.typeExtension = typeExtension || '';
    this.styleProperties = null;
    this.scopeSelector = null;
    this.customStyle = null;
  }
}

// TODO: dedupe with shady
let p = window.Element.prototype;
let matchesSelector = p.matches || p.matchesSelector ||
  p.mozMatchesSelector || p.msMatchesSelector ||
  p.oMatchesSelector || p.webkitMatchesSelector;

let IS_IE = navigator.userAgent.match('Trident');

let StyleProperties = {

  // decorates styles with rule info and returns an array of used style
  // property names
  decorateStyles: function(rules) {
    let self = this, props = {}, keyframes = [], ruleIndex = 0;
    forEachRule(rules, function(rule) {
      self.decorateRule(rule);
      // mark in-order position of ast rule in styles block, used for cache key
      rule.index = ruleIndex++;
      self.collectPropertiesInCssText(rule.propertyInfo.cssText, props);
    }, function onKeyframesRule(rule) {
      keyframes.push(rule);
    });
    // Cache all found keyframes rules for later reference:
    rules._keyframes = keyframes;
    // return this list of property names *consumes* in these styles.
    let names = [];
    for (let i in props) {
      names.push(i);
    }
    return names;
  },

  // decorate a single rule with property info
  decorateRule: function(rule) {
    if (rule.propertyInfo) {
      return rule.propertyInfo;
    }
    let info = {}, properties = {};
    let hasProperties = this.collectProperties(rule, properties);
    if (hasProperties) {
      info.properties = properties;
      // TODO(sorvell): workaround parser seeing mixins as additional rules
      rule.rules = null;
    }
    info.cssText = this.collectCssText(rule);
    rule.propertyInfo = info;
    return info;
  },

  // collects the custom properties from a rule's cssText
  collectProperties: function(rule, properties) {
    let info = rule.propertyInfo;
    if (info) {
      if (info.properties) {
        Object.assign(properties, info.properties);
        return true;
      }
    } else {
      let m, rx = this.rx.VAR_ASSIGN;
      let cssText = rule.parsedCssText;
      let value;
      let any;
      while ((m = rx.exec(cssText))) {
        // note: group 2 is var, 3 is mixin
        value = (m[2] || m[3]).trim();
        // value of 'inherit' or 'unset' is equivalent to not setting the property here
        if (value !== 'inherit' || value !== 'unset') {
          properties[m[1].trim()] = value;
        }
        any = true;
      }
      return any;
    }

  },

  // returns cssText of properties that consume variables/mixins
  collectCssText: function(rule) {
    return this.collectConsumingCssText(rule.parsedCssText);
  },

  // NOTE: we support consumption inside mixin assignment
  // but not production, so strip out {...}
  collectConsumingCssText: function(cssText) {
    return cssText.replace(this.rx.BRACKETED, '')
      .replace(this.rx.VAR_ASSIGN, '');
  },

  collectPropertiesInCssText: function(cssText, props) {
    let m;
    while ((m = this.rx.VAR_CONSUMED.exec(cssText))) {
      let name = m[1];
      // This regex catches all variable names, and following non-whitespace char
      // If next char is not ':', then variable is a consumer
      if (m[2] !== ':') {
        props[name] = true;
      }
    }
  },

  // turns custom properties into realized values.
  reify: function(props) {
    // big perf optimization here: reify only *own* properties
    // since this object has __proto__ of the element's scope properties
    let names = Object.getOwnPropertyNames(props);
    for (let i=0, n; i < names.length; i++) {
      n = names[i];
      props[n] = this.valueForProperty(props[n], props);
    }
  },

  // given a property value, returns the reified value
  // a property value may be:
  // (1) a literal value like: red or 5px;
  // (2) a variable value like: var(--a), var(--a, red), or var(--a, --b) or
  // var(--a, var(--b));
  // (3) a literal mixin value like { properties }. Each of these properties
  // can have values that are: (a) literal, (b) variables, (c) @apply mixins.
  valueForProperty: function(property, props) {
    // case (1) default
    // case (3) defines a mixin and we have to reify the internals
    if (property) {
      if (property.indexOf(';') >=0) {
        property = this.valueForProperties(property, props);
      } else {
        // case (2) variable
        let self = this;
        let fn = function(prefix, value, fallback, suffix) {
          if (!value) {
            return prefix + suffix;
          }
          let propertyValue = self.valueForProperty(props[value], props);
          // if value is "initial", then the variable should be treated as unset
          if (!propertyValue || propertyValue === 'initial') {
            // fallback may be --a or var(--a) or literal
            propertyValue = self.valueForProperty(props[fallback] || fallback, props) ||
            fallback;
          } else if (propertyValue === 'apply-shim-inherit') {
            // CSS build will replace `inherit` with `apply-shim-inherit`
            // for use with native css variables.
            // Since we have full control, we can use `inherit` directly.
            propertyValue = 'inherit';
          }
          return prefix + (propertyValue || '') + suffix;
        };
        property = processVariableAndFallback(property, fn);
      }
    }
    return property && property.trim() || '';
  },

  // note: we do not yet support mixin within mixin
  valueForProperties: function(property, props) {
    let parts = property.split(';');
    for (let i=0, p, m; i<parts.length; i++) {
      if ((p = parts[i])) {
        this.rx.MIXIN_MATCH.lastIndex = 0;
        m = this.rx.MIXIN_MATCH.exec(p);
        if (m) {
          p = this.valueForProperty(props[m[1]], props);
        } else {
          let colon = p.indexOf(':');
          if (colon !== -1) {
            let pp = p.substring(colon);
            pp = pp.trim();
            pp = this.valueForProperty(pp, props) || pp;
            p = p.substring(0, colon) + pp;
          }
        }
        parts[i] = (p && p.lastIndexOf(';') === p.length - 1) ?
          // strip trailing ;
          p.slice(0, -1) :
          p || '';
      }
    }
    return parts.join(';');
  },

  applyProperties: function(rule, props) {
    let output = '';
    // dynamically added sheets may not be decorated so ensure they are.
    if (!rule.propertyInfo) {
      this.decorateRule(rule);
    }
    if (rule.propertyInfo.cssText) {
      output = this.valueForProperties(rule.propertyInfo.cssText, props);
    }
    rule.cssText = output;
  },

  // Apply keyframe transformations to the cssText of a given rule. The
  // keyframeTransforms object is a map of keyframe names to transformer
  // functions which take in cssText and spit out transformed cssText.
  applyKeyframeTransforms: function(rule, keyframeTransforms) {
    let input = rule.cssText;
    let output = rule.cssText;
    if (rule.hasAnimations == null) {
      // Cache whether or not the rule has any animations to begin with:
      rule.hasAnimations = this.rx.ANIMATION_MATCH.test(input);
    }
    // If there are no animations referenced, we can skip transforms:
    if (rule.hasAnimations) {
      let transform;
      // If we haven't transformed this rule before, we iterate over all
      // transforms:
      if (rule.keyframeNamesToTransform == null) {
        rule.keyframeNamesToTransform = [];
        for (let keyframe in keyframeTransforms) {
          transform = keyframeTransforms[keyframe];
          output = transform(input);
          // If the transform actually changed the CSS text, we cache the
          // transform name for future use:
          if (input !== output) {
            input = output;
            rule.keyframeNamesToTransform.push(keyframe);
          }
        }
      } else {
        // If we already have a list of keyframe names that apply to this
        // rule, we apply only those keyframe name transforms:
        for (let i = 0; i < rule.keyframeNamesToTransform.length; ++i) {
          transform = keyframeTransforms[rule.keyframeNamesToTransform[i]];
          input = transform(input);
        }
        output = input;
      }
    }
    rule.cssText = output;
  },

  // Test if the rules in these styles matches the given `element` and if so,
  // collect any custom properties into `props`.
  propertyDataFromStyles: function(rules, element) {
    let props = {}, self = this;
    // generates a unique key for these matches
    let o = [];
    // note: active rules excludes non-matching @media rules
    forEachRule(rules, function(rule) {
      // TODO(sorvell): we could trim the set of rules at declaration
      // time to only include ones that have properties
      if (!rule.propertyInfo) {
        self.decorateRule(rule);
      }
      // match element against transformedSelector: selector may contain
      // unwanted uniquification and parsedSelector does not directly match
      // for :host selectors.
      let selectorToMatch = rule.transformedSelector || rule.parsedSelector;
      if (element && rule.propertyInfo.properties && selectorToMatch) {
        if (matchesSelector.call(element, selectorToMatch)) {
          self.collectProperties(rule, props);
          // produce numeric key for these matches for lookup
          addToBitMask(rule.index, o);
        }
      }
    }, null, true);
    return {properties: props, key: o};
  },

  whenHostOrRootRule: function(scope, rule, cssBuild, callback) {
    if (!rule.propertyInfo) {
      this.decorateRule(rule);
    }
    if (!rule.propertyInfo.properties) {
      return;
    }
    let hostScope = scope.is ?
    StyleTransformer._calcHostScope(scope.is, scope.extends) :
    'html';
    let parsedSelector = rule.parsedSelector;
    let isRoot = (parsedSelector === ':host > *' || parsedSelector === 'html');
    let isHost = parsedSelector.indexOf(':host') === 0 && !isRoot;
    // build info is either in scope (when scope is an element) or in the style
    // when scope is the default scope; note: this allows default scope to have
    // mixed mode built and unbuilt styles.
    if (cssBuild === 'shady') {
      // :root -> x-foo > *.x-foo for elements and html for custom-style
      isRoot = parsedSelector === (hostScope + ' > *.' + hostScope) || parsedSelector.indexOf('html') !== -1;
      // :host -> x-foo for elements, but sub-rules have .x-foo in them
      isHost = !isRoot && parsedSelector.indexOf(hostScope) === 0;
    }
    if (cssBuild === 'shadow') {
      isRoot = parsedSelector === ':host > *' || parsedSelector === 'html';
      isHost = isHost && !isRoot;
    }
    if (!isRoot && !isHost) {
      return;
    }
    let selectorToMatch = hostScope;
    if (isHost) {
      // need to transform :host under ShadowDOM because `:host` does not work with `matches`
      if (nativeShadow && !rule.transformedSelector) {
        // transform :host into a matchable selector
        rule.transformedSelector =
        StyleTransformer._transformRuleCss(
          rule,
          StyleTransformer._transformComplexSelector,
          StyleTransformer._calcElementScope(scope.is),
          hostScope
        );
      }
      selectorToMatch = rule.transformedSelector || hostScope;
    }
    callback({
      selector: selectorToMatch,
      isHost: isHost,
      isRoot: isRoot
    });
  },

  hostAndRootPropertiesForScope: function(scope, rules) {
    let hostProps = {}, rootProps = {}, self = this;
    // note: active rules excludes non-matching @media rules
    let cssBuild = rules && rules.__cssBuild;
    forEachRule(rules, function(rule) {
      // if scope is StyleDefaults, use _element for matchesSelector
      self.whenHostOrRootRule(scope, rule, cssBuild, function(info) {
        let element = scope._element || scope;
        if (matchesSelector.call(element, info.selector)) {
          if (info.isHost) {
            self.collectProperties(rule, hostProps);
          } else {
            self.collectProperties(rule, rootProps);
          }
        }
      });
    }, null, true);
    return {rootProps: rootProps, hostProps: hostProps};
  },

  transformStyles: function(element, properties, scopeSelector) {
    let self = this;
    let hostSelector = StyleTransformer
      ._calcHostScope(element.is, element.extends);
    let rxHostSelector = element.extends ?
      '\\' + hostSelector.slice(0, -1) + '\\]' :
      hostSelector;
    let hostRx = new RegExp(this.rx.HOST_PREFIX + rxHostSelector +
      this.rx.HOST_SUFFIX);
    let rules = StyleInfo.get(element).styleRules;
    let keyframeTransforms =
      this._elementKeyframeTransforms(element, rules, scopeSelector);
    return StyleTransformer.elementStyles(element, rules, function(rule) {
      self.applyProperties(rule, properties);
      if (!nativeShadow &&
          !isKeyframesSelector(rule) &&
          rule.cssText) {
        // NOTE: keyframe transforms only scope munge animation names, so it
        // is not necessary to apply them in ShadowDOM.
        self.applyKeyframeTransforms(rule, keyframeTransforms);
        self._scopeSelector(rule, hostRx, hostSelector, scopeSelector);
      }
    });
  },

  _elementKeyframeTransforms: function(element, rules, scopeSelector) {
    let keyframesRules = rules._keyframes;
    let keyframeTransforms = {};
    if (!nativeShadow && keyframesRules) {
      // For non-ShadowDOM, we transform all known keyframes rules in
      // advance for the current scope. This allows us to catch keyframes
      // rules that appear anywhere in the stylesheet:
      for (let i = 0, keyframesRule = keyframesRules[i];
           i < keyframesRules.length;
           keyframesRule = keyframesRules[++i]) {
        this._scopeKeyframes(keyframesRule, scopeSelector);
        keyframeTransforms[keyframesRule.keyframesName] =
            this._keyframesRuleTransformer(keyframesRule);
      }
    }
    return keyframeTransforms;
  },

  // Generate a factory for transforming a chunk of CSS text to handle a
  // particular scoped keyframes rule.
  _keyframesRuleTransformer: function(keyframesRule) {
    return function(cssText) {
      return cssText.replace(
          keyframesRule.keyframesNameRx,
          keyframesRule.transformedKeyframesName);
    };
  },

  // Transforms `@keyframes` names to be unique for the current host.
  // Example: @keyframes foo-anim -> @keyframes foo-anim-x-foo-0
  _scopeKeyframes: function(rule, scopeId) {
    rule.keyframesNameRx = new RegExp(rule.keyframesName, 'g');
    rule.transformedKeyframesName = rule.keyframesName + '-' + scopeId;
    rule.transformedSelector = rule.transformedSelector || rule.selector;
    rule.selector = rule.transformedSelector.replace(
        rule.keyframesName, rule.transformedKeyframesName);
  },

  // Strategy: x scope shim a selector e.g. to scope `.x-foo-42` (via classes):
  // non-host selector: .a.x-foo -> .x-foo-42 .a.x-foo
  // host selector: x-foo.wide -> .x-foo-42.wide
  // note: we use only the scope class (.x-foo-42) and not the hostSelector
  // (x-foo) to scope :host rules; this helps make property host rules
  // have low specificity. They are overrideable by class selectors but,
  // unfortunately, not by type selectors (e.g. overriding via
  // `.special` is ok, but not by `x-foo`).
  _scopeSelector: function(rule, hostRx, hostSelector, scopeId) {
    rule.transformedSelector = rule.transformedSelector || rule.selector;
    let selector = rule.transformedSelector;
    let scope = '.' + scopeId;
    let parts = selector.split(',');
    for (let i=0, l=parts.length, p; (i<l) && (p=parts[i]); i++) {
      parts[i] = p.match(hostRx) ?
        p.replace(hostSelector, scope) :
        scope + ' ' + p;
    }
    rule.selector = parts.join(',');
  },

  applyElementScopeSelector: function(element, selector, old) {
    let c = element.getAttribute('class') || '';
    let v = old ? c.replace(old, selector) :
      (c ? c + ' ' : '') + this.XSCOPE_NAME + ' ' + selector;
    if (c !== v) {
      element.setAttribute('class', v);
    }
  },

  applyElementStyle: function(element, properties, selector, style) {
    // calculate cssText to apply
    let cssText = style ? style.textContent || '' :
      this.transformStyles(element, properties, selector);
    // if shady and we have a cached style that is not style, decrement
    let styleInfo = StyleInfo.get(element);
    let s = styleInfo.customStyle;
    if (s && !nativeShadow && (s !== style)) {
      s._useCount--;
      if (s._useCount <= 0 && s.parentNode) {
        s.parentNode.removeChild(s);
      }
    }
    // apply styling always under native or if we generated style
    // or the cached style is not in document(!)
    if (nativeShadow) {
      // update existing style only under native
      if (styleInfo.customStyle) {
        styleInfo.customStyle.textContent = cssText;
        style = styleInfo.customStyle;
      // otherwise, if we have css to apply, do so
      } else if (cssText) {
        // apply css after the scope style of the element to help with
        // style precedence rules.
        style = applyCss(cssText, selector, element.shadowRoot,
          styleInfo.placeholder);
      }
    } else {
      // shady and no cache hit
      if (!style) {
        // apply css after the scope style of the element to help with
        // style precedence rules.
        if (cssText) {
          style = applyCss(cssText, selector, null,
            styleInfo.placeholder);
        }
      // shady and cache hit but not in document
      } else if (!style.parentNode) {
        applyStyle(style, null, styleInfo.placeholder);
      }

    }
    // ensure this style is our custom style and increment its use count.
    if (style) {
      style._useCount = style._useCount || 0;
      // increment use count if we changed styles
      if (styleInfo.customStyle != style) {
        style._useCount++;
      }
      styleInfo.customStyle = style;
    }
    // @media rules may be stale in IE 10 and 11
    if (IS_IE) {
      style.textContent = style.textContent;
    }
    return style;
  },

  applyCustomStyle: function(style, properties) {
    let rules = rulesForStyle(style);
    let self = this;
    style.textContent = toCssText(rules, function(rule) {
      let css = rule.cssText = rule.parsedCssText;
      if (rule.propertyInfo && rule.propertyInfo.cssText) {
        // remove property assignments
        // so next function isn't confused
        // NOTE: we have 3 categories of css:
        // (1) normal properties,
        // (2) custom property assignments (--foo: red;),
        // (3) custom property usage: border: var(--foo); @apply(--foo);
        // In elements, 1 and 3 are separated for efficiency; here they
        // are not and this makes this case unique.
        css = removeCustomPropAssignment(css);
        // replace with reified properties, scenario is same as mixin
        rule.cssText = self.valueForProperties(css, properties);
      }
    });
  },

  rx: rx,
  XSCOPE_NAME: 'x-scope'
};

function addToBitMask(n, bits) {
  let o = parseInt(n / 32);
  let v = 1 << (n % 32);
  bits[o] = (bits[o] || 0) | v;
}

var templateMap = {};

let placeholderMap = {};

class StyleCache {
  constructor(typeMax = 100) {
    // map element name -> [{properties, styleElement, scopeSelector}]
    this.cache = {};
    this.typeMax = typeMax;
  }

  _validate(cacheEntry, properties, ownPropertyNames) {
    for (let idx = 0; idx < ownPropertyNames.length; idx++) {
      let pn = ownPropertyNames[idx];
      if (cacheEntry.properties[pn] !== properties[pn]) {
        return false;
      }
    }
    return true;
  }

  store(tagname, properties, styleElement, scopeSelector) {
    let list = this.cache[tagname] || [];
    list.push({properties, styleElement, scopeSelector});
    if (list.length > this.typeMax) {
      list.shift();
    }
    this.cache[tagname] = list;
  }

  fetch(tagname, properties, ownPropertyNames) {
    let list = this.cache[tagname];
    if (!list) {
      return;
    }
    // reverse list for most-recent lookups
    for (let idx = list.length - 1; idx >= 0; idx--) {
      let entry = list[idx];
      if (this._validate(entry, properties, ownPropertyNames)) {
        return entry;
      }
    }
  }
}

let MIXIN_MATCH = rx.MIXIN_MATCH;
let VAR_ASSIGN = rx.VAR_ASSIGN;

let APPLY_NAME_CLEAN = /;\s*/m;
let INITIAL_INHERIT = /^\s*(initial)|(inherit)\s*$/;

// separator used between mixin-name and mixin-property-name when producing properties
// NOTE: plain '-' may cause collisions in user styles
let MIXIN_VAR_SEP = '_-_';

// map of mixin to property names
// --foo: {border: 2px} -> {properties: {(--foo, ['border'])}, dependants: {'element-name': proto}}
class MixinMap {
  constructor() {
    this._map = {};
  }
  set(name, props) {
    name = name.trim();
    this._map[name] = {
      properties: props,
      dependants: {}
    }
  }
  get(name) {
    name = name.trim();
    return this._map[name];
  }
}

class ApplyShim {
  constructor() {
    this._currentTemplate = null;
    this._measureElement = null;
    this._map = new MixinMap();
    this._separator = MIXIN_VAR_SEP;
    this._boundProduceCssProperties = (
      matchText, propertyName, valueProperty, valueMixin) =>
        this._produceCssProperties(
          matchText, propertyName, valueProperty, valueMixin);
  }
  transformStyle(style, elementName) {
    let ast = rulesForStyle(style);
    this.transformRules(ast, elementName);
    return ast;
  }
  transformRules(rules, elementName) {
    this._currentTemplate = templateMap[elementName];
    forEachRule(rules, (r) => { this.transformRule(r); });
    if (this._currentTemplate) {
      this._currentTemplate.__applyShimInvalid = false;
    }
    this._currentTemplate = null;
  }
  transformRule(rule) {
    rule.cssText = this.transformCssText(rule.parsedCssText);
    // :root was only used for variable assignment in property shim,
    // but generates invalid selectors with real properties.
    // replace with `:host > *`, which serves the same effect
    if (rule.selector === ':root' && window.chrome) {
      rule.selector = ':host > *';
    }
  }
  transformCssText(cssText) {
    // produce variables
    cssText = cssText.replace(VAR_ASSIGN, this._boundProduceCssProperties);
    // consume mixins
    return this._consumeCssProperties(cssText);
  }
  _getInitialValueForProperty(property) {
    if (!this._measureElement) {
      this._measureElement = document.createElement('meta');
      this._measureElement.style.all = 'initial';
      document.head.appendChild(this._measureElement);
    }
    return window.getComputedStyle(this._measureElement).getPropertyValue(property);
  }
  // replace mixin consumption with variable consumption
  _consumeCssProperties(text) {
    let m;
    // loop over text until all mixins with defintions have been applied
    while((m = MIXIN_MATCH.exec(text))) {
      let matchText = m[0];
      let mixinName = m[1];
      let idx = m.index;
      // collect properties before apply to be "defaults" if mixin might override them
      // match includes a "prefix", so find the start and end positions of @apply
      let applyPos = idx + matchText.indexOf('@apply');
      let afterApplyPos = idx + matchText.length;
      // find props defined before this @apply
      let textBeforeApply = text.slice(0, applyPos);
      let textAfterApply = text.slice(afterApplyPos);
      let defaults = this._cssTextToMap(textBeforeApply);
      let replacement = this._atApplyToCssProperties(mixinName, defaults);
      // use regex match position to replace mixin, keep linear processing time
      text = [textBeforeApply, replacement, textAfterApply].join('');
      // move regex search to _after_ replacement
      MIXIN_MATCH.lastIndex = idx + replacement.length;
    }
    return text;
  }
  // produce variable consumption at the site of mixin consumption
  // @apply --foo; -> for all props (${propname}: var(--foo_-_${propname}, ${fallback[propname]}}))
  // Example:
  // border: var(--foo_-_border); padding: var(--foo_-_padding, 2px)
  _atApplyToCssProperties(mixinName, fallbacks) {
    mixinName = mixinName.replace(APPLY_NAME_CLEAN, '');
    let vars = [];
    let mixinEntry = this._map.get(mixinName);
    // if we depend on a mixin before it is created
    // make a sentinel entry in the map to add this element as a dependency for when it is defined.
    if (!mixinEntry) {
      this._map.set(mixinName, {});
      mixinEntry = this._map.get(mixinName);
    }
    if (mixinEntry) {
      if (this._currentTemplate) {
        mixinEntry.dependants[this._currentTemplate.name] = this._currentTemplate;
      }
      let p, parts, f;
      for (p in mixinEntry.properties) {
        f = fallbacks && fallbacks[p];
        parts = [p, ': var(', mixinName, MIXIN_VAR_SEP, p];
        if (f) {
          parts.push(',', f);
        }
        parts.push(')');
        vars.push(parts.join(''));
      }
    }
    return vars.join('; ');
  }

  _replaceInitialOrInherit(property, value) {
    let match = INITIAL_INHERIT.exec(value);
    if (match) {
      if (match[1]) {
        // initial
        // replace `initial` with the concrete initial value for this property
        value = ApplyShim._getInitialValueForProperty(property);
      } else {
        // inherit
        // with this purposfully illegal value, the variable will be invalid at
        // compute time (https://www.w3.org/TR/css-variables/#invalid-at-computed-value-time)
        // and for inheriting values, will behave similarly
        // we cannot support the same behavior for non inheriting values like 'border'
        value = 'apply-shim-inherit';
      }
    }
    return value;
  }

  // "parse" a mixin definition into a map of properties and values
  // cssTextToMap('border: 2px solid black') -> ('border', '2px solid black')
  _cssTextToMap(text) {
    let props = text.split(';');
    let property, value;
    let out = {};
    for (let i = 0, p, sp; i < props.length; i++) {
      p = props[i];
      if (p) {
        sp = p.split(':');
        // ignore lines that aren't definitions like @media
        if (sp.length > 1) {
          property = sp[0].trim();
          // some properties may have ':' in the value, like data urls
          value = this._replaceInitialOrInherit(property, sp.slice(1).join(':'));
          out[property] = value;
        }
      }
    }
    return out;
  }

  _invalidateMixinEntry(mixinEntry) {
    for (let elementName in mixinEntry.dependants) {
      if (elementName !== this._currentTemplate) {
        mixinEntry.dependants[elementName].__applyShimInvalid = true;
      }
    }
  }

  _produceCssProperties(matchText, propertyName, valueProperty, valueMixin) {
    // handle case where property value is a mixin
    if (valueProperty) {
      // form: --mixin2: var(--mixin1), where --mixin1 is in the map
      processVariableAndFallback(valueProperty, (prefix, value) => {
        if (value && this._map.get(value)) {
          valueMixin = '@apply ' + value + ';';
        }
      });
    }
    if (!valueMixin) {
      return matchText;
    }
    let mixinAsProperties = this._consumeCssProperties(valueMixin);
    let prefix = matchText.slice(0, matchText.indexOf('--'));
    let mixinValues = this._cssTextToMap(mixinAsProperties);
    let combinedProps = mixinValues;
    let mixinEntry = this._map.get(propertyName);
    let oldProps = mixinEntry && mixinEntry.properties;
    if (oldProps) {
      // NOTE: since we use mixin, the map of properties is updated here
      // and this is what we want.
      combinedProps = Object.assign(Object.create(oldProps), mixinValues);
    } else {
      this._map.set(propertyName, combinedProps);
    }
    let out = [];
    let p, v;
    // set variables defined by current mixin
    let needToInvalidate = false;
    for (p in combinedProps) {
      v = mixinValues[p];
      // if property not defined by current mixin, set initial
      if (v === undefined) {
        v = 'initial';
      }
      if (oldProps && !(p in oldProps)) {
        needToInvalidate = true;
      }
      out.push(propertyName + MIXIN_VAR_SEP + p + ': ' + v);
    }
    if (needToInvalidate) {
      this._invalidateMixinEntry(mixinEntry);
    }
    if (mixinEntry) {
      mixinEntry.properties = combinedProps;
    }
    // because the mixinMap is global, the mixin might conflict with
    // a different scope's simple variable definition:
    // Example:
    // some style somewhere:
    // --mixin1:{ ... }
    // --mixin2: var(--mixin1);
    // some other element:
    // --mixin1: 10px solid red;
    // --foo: var(--mixin1);
    // In this case, we leave the original variable definition in place.
    if (valueProperty) {
      prefix = matchText + ';' + prefix;
    }
    return prefix + out.join('; ') + ';';
  }
}

let applyShim = new ApplyShim();
window['ApplyShim'] = applyShim;

let styleCache = new StyleCache();

let ShadyCSS$1 = {
  scopeCounter: {},
  nativeShadow: nativeShadow,
  nativeCss: nativeCssVariables,
  nativeCssApply: nativeCssApply,
  _documentOwner: document.documentElement,
  _documentOwnerStyleInfo: StyleInfo.set(document.documentElement, new StyleInfo({rules: []})),
  _generateScopeSelector(name) {
    let id = this.scopeCounter[name] = (this.scopeCounter[name] || 0) + 1;
    return name + '-' + id;
  },
  getStyleAst(style) {
    return rulesForStyle(style);
  },
  styleAstToString(ast) {
    return toCssText(ast);
  },
  _gatherStyles(template) {
    let styles = template.content.querySelectorAll('style');
    let cssText = [];
    for (let i = 0; i < styles.length; i++) {
      let s = styles[i];
      cssText.push(s.textContent);
      s.parentNode.removeChild(s);
    }
    return cssText.join('').trim();
  },
  _getCssBuild(template) {
    let style = template.content.querySelector('style');
    if (!style) {
      return '';
    }
    return style.getAttribute('css-build') || '';
  },
  prepareTemplate(template, elementName, typeExtension) {
    if (template._prepared) {
      return;
    }
    template._prepared = true;
    template.name = elementName;
    template.extends = typeExtension;
    templateMap[elementName] = template;
    let cssBuild = this._getCssBuild(template);
    let cssText = this._gatherStyles(template);
    let info = {
      is: elementName,
      extends: typeExtension,
      __cssBuild: cssBuild,
    };
    if (!this.nativeShadow) {
      StyleTransformer.dom(template.content, elementName);
    }
    let ast = parse(cssText);
    if (this.nativeCss && !this.nativeCssApply) {
      applyShim.transformRules(ast, elementName);
    }
    template._styleAst = ast;

    let ownPropertyNames = [];
    if (!this.nativeCss) {
      ownPropertyNames = StyleProperties.decorateStyles(template._styleAst, info);
    }
    if (!ownPropertyNames.length || this.nativeCss) {
      let root = this.nativeShadow ? template.content : null;
      let placeholder = placeholderMap[elementName];
      let style = this._generateStaticStyle(info, template._styleAst, root, placeholder);
      template._style = style;
    }
    template._ownPropertyNames = ownPropertyNames;
  },
  _generateStaticStyle(info, rules, shadowroot, placeholder) {
    let cssText = StyleTransformer.elementStyles(info, rules);
    if (cssText.length) {
      return applyCss(cssText, info.is, shadowroot, placeholder);
    }
  },
  _prepareHost(host) {
    let is = host.getAttribute('is') || host.localName;
    let typeExtension;
    if (is !== host.localName) {
      typeExtension = host.localName;
    }
    let placeholder = placeholderMap[is];
    let template = templateMap[is];
    let ast;
    let ownStylePropertyNames;
    let cssBuild;
    if (template) {
      ast = template._styleAst;
      ownStylePropertyNames = template._ownPropertyNames;
      cssBuild = template._cssBuild;
    }
    return StyleInfo.set(host,
      new StyleInfo(
        ast,
        placeholder,
        ownStylePropertyNames,
        is,
        typeExtension,
        cssBuild
      )
    );
  },
  applyStyle(host, overrideProps) {
    if (window.CustomStyle) {
      let CS = window.CustomStyle;
      if (CS._documentDirty) {
        CS.findStyles();
        if (!this.nativeCss) {
          this._updateProperties(this._documentOwner, this._documentOwnerStyleInfo);
        } else if (!this.nativeCssApply) {
          CS._revalidateApplyShim();
        }
        CS.applyStyles();
        CS._documentDirty = false;
      }
    }
    let styleInfo = StyleInfo.get(host);
    if (!styleInfo) {
      styleInfo = this._prepareHost(host);
    }
    let is = host.getAttribute('is') || host.localName;
    Object.assign(styleInfo.overrideStyleProperties, overrideProps);
    if (this.nativeCss) {
      let template = templateMap[is];
      if (template && template.__applyShimInvalid && template._style) {
        // update template
        applyShim.transformRules(template._styleAst, is);
        template._style.textContent = StyleTransformer.elementStyles(host, styleInfo.styleRules);
        // update instance if native shadowdom
        if (this.nativeShadow) {
          let style = host.shadowRoot.querySelector('style');
          style.textContent = StyleTransformer.elementStyles(host, styleInfo.styleRules);
        }
        styleInfo.styleRules = template._styleAst;
      }
      this._updateNativeProperties(host, styleInfo.overrideStyleProperties);
    } else {
      this._updateProperties(host, styleInfo);
      if (styleInfo.ownStylePropertyNames && styleInfo.ownStylePropertyNames.length) {
        // TODO: use caching
        this._applyStyleProperties(host, styleInfo);
      }
      let root = this._isRootOwner(host) ? host : host.shadowRoot;
      // note: some elements may not have a root!
      if (root) {
        this._applyToDescendants(root);
      }
    }
  },
  _applyToDescendants(root) {
    let c$ = root.children;
    for (let i = 0, c; i < c$.length; i++) {
      c = c$[i];
      if (c.shadowRoot) {
        this.applyStyle(c);
      }
      this._applyToDescendants(c);
    }
  },
  _styleOwnerForNode(node) {
    let root = node.getRootNode();
    let host = root.host;
    if (host) {
      if (StyleInfo.get(host)) {
        return host;
      } else {
        return this._styleOwnerForNode(host);
      }
    }
    return this._documentOwner;
  },
  _isRootOwner(node) {
    return (node === this._documentOwner);
  },
  _applyStyleProperties(host, styleInfo) {
    let is = host.getAttribute('is') || host.localName;
    let cacheEntry = styleCache.fetch(is, styleInfo.styleProperties, styleInfo.ownStylePropertyNames);
    let cachedScopeSelector = cacheEntry && cacheEntry.scopeSelector;
    let cachedStyle = cacheEntry ? cacheEntry.styleElement : null;
    let oldScopeSelector = styleInfo.scopeSelector;
    // only generate new scope if cached style is not found
    styleInfo.scopeSelector = cachedScopeSelector || this._generateScopeSelector(is);
    let style = StyleProperties.applyElementStyle(host, styleInfo.styleProperties, styleInfo.scopeSelector, cachedStyle);
    if (!this.nativeShadow) {
      StyleProperties.applyElementScopeSelector(host, styleInfo.scopeSelector, oldScopeSelector);
    }
    if (!cacheEntry) {
      styleCache.store(is, styleInfo.styleProperties, style, styleInfo.scopeSelector);
    }
    return style;
  },
  _updateProperties(host, styleInfo) {
    let owner = this._styleOwnerForNode(host);
    let ownerStyleInfo = StyleInfo.get(owner);
    let ownerProperties = ownerStyleInfo.styleProperties;
    let props = Object.create(ownerProperties || null);
    let hostAndRootProps = StyleProperties.hostAndRootPropertiesForScope(host, styleInfo.styleRules);
    let propertyData = StyleProperties.propertyDataFromStyles(ownerStyleInfo.styleRules, host);
    let propertiesMatchingHost = propertyData.properties
    Object.assign(
      props,
      hostAndRootProps.hostProps,
      propertiesMatchingHost,
      hostAndRootProps.rootProps
    );
    this._mixinOverrideStyles(props, styleInfo.overrideStyleProperties);
    StyleProperties.reify(props);
    styleInfo.styleProperties = props;
  },
  _mixinOverrideStyles(props, overrides) {
    for (let p in overrides) {
      let v = overrides[p];
      // skip override props if they are not truthy or 0
      // in order to fall back to inherited values
      if (v || v === 0) {
        props[p] = v;
      }
    }
  },
  _updateNativeProperties(element, properties) {
    // remove previous properties
    for (let p in properties) {
      // NOTE: for bc with shim, don't apply null values.
      if (p === null) {
        element.style.removeProperty(p);
      } else {
        element.style.setProperty(p, properties[p]);
      }
    }
  },
  updateStyles(properties) {
    if (window.CustomStyle) {
      window.CustomStyle._documentDirty = true;
    }
    this.applyStyle(this._documentOwner, properties);
  },
  /* Custom Style operations */
  _transformCustomStyleForDocument(style) {
    let ast = rulesForStyle(style);
    forEachRule(ast, (rule) => {
      if (nativeShadow) {
        StyleTransformer.normalizeRootSelector(rule);
      } else {
        StyleTransformer.documentRule(rule);
      }
      if (this.nativeCss && !this.nativeCssApply) {
        applyShim.transformRule(rule);
      }
    });
    if (this.nativeCss) {
      style.textContent = toCssText(ast);
    } else {
      this._documentOwnerStyleInfo.styleRules.rules.push(ast);
    }
  },
  _revalidateApplyShim(style) {
    if (this.nativeCss && !this.nativeCssApply) {
      let ast = rulesForStyle(style);
      applyShim.transformRules(ast);
      style.textContent = toCssText(ast);
    }
  },
  _applyCustomStyleToDocument(style) {
    if (!this.nativeCss) {
      StyleProperties.applyCustomStyle(style, this._documentOwnerStyleInfo.styleProperties);
    }
  },
  getComputedStyleValue(element, property) {
    let value;
    if (!this.nativeCss) {
      // element is either a style host, or an ancestor of a style host
      let styleInfo = StyleInfo.get(element) || StyleInfo.get(this._styleOwnerForNode(element));
      value = styleInfo.styleProperties[property];
    }
    // fall back to the property value from the computed styling
    value = value || window.getComputedStyle(element).getPropertyValue(property);
    // trim whitespace that can come after the `:` in css
    // example: padding: 2px -> " 2px"
    return value.trim();
  }
}

window['ShadyCSS'] = ShadyCSS$1;

let stylesheets = {}

let templates = {}

class TemplateElement extends HTMLElement {

  createdCallback () {
    let name = this.id
    let template = this.querySelector('template')
    template = document.importNode(template, true)
    templates[name] = template

    this.prepareTemplate(template, name)

    if (this.hasAttribute('selfy')) {
      document.registerElement(name, class extends Pantarei.Element {})
    }
    console.log('created', name)
  }

  // TODO: create LinkStylesheet element
  prepareTemplate (template, name) {
    if (typeof ShadyCSS$1 === 'undefined') {
      return
    }
    ShadyCSS$1.prepareTemplate(template, name)

    let stylesheets = template.content.querySelectorAll('link[rel="stylesheet"]')

    Array.from(stylesheets).forEach((stylesheet) => {
      let href = stylesheet.getAttribute('href')

      stylesheets[href] = new Promise((resolve, reject) => {
        fetch(href)
          .then((response) => {
            return response.text()
          })
          .then((text) => {
            let template = document.createElement('template')
            let stylenode = document.createElement('style')
            template.content.appendChild(stylenode)
            stylenode.textContent = text
            ShadyCSS$1.prepareTemplate(template, name)
            stylenode = template.content.querySelector('style')
            resolve(stylenode)
          })
          .catch((err) => {
            reject(err)
          })
      })

    })
  }

}

document.registerElement('template-element', TemplateElement)

class Element extends HTMLElement {

  get ATTRIBUTE_EVENT_PREFIX () { return 'on-' }

  get EXPRESSION_BEGIN () { return '{{' }

  get EXPRESSION_END () { return '}}' }

  get props () { return {} }

  setup () {
    this._parse()
  }

  _listener (event) {
    let root = this.shadowRoot
    let target = event.target

    let event_type = event.type
    let event_attr = this.ATTRIBUTE_EVENT_PREFIX + event_type

    let bubble = true
    let stop = event.stopPropagation

    event.stopPropagation = function () {
      stop.call(event)
      bubble = false
    }

    while (bubble) {
      let listener_name = target.getAttribute(event_attr)
      if (listener_name) {
        let listener = this[listener_name]
        listener.call(this, event, event.detail)
      }

      if (!bubble) {
        break
      }

      target = target.parentNode
      if (!target) {
        break
      }
      if (target === root) {
        break
      }
    }
  }

  _is_expression (text) {
    return text.startsWith(this.EXPRESSION_BEGIN) && text.endsWith(this.EXPRESSION_END)
  }

  _is_event (string) {
    return string.startsWith(this.ATTRIBUTE_EVENT_PREFIX)
  }

  _parse_event (string) {
    return string.slice(this.ATTRIBUTE_EVENT_PREFIX.length)
  }

  _parse () {
    this._listeners = {}

    let root = this.shadowRoot
    let child = root.firstChild
    while (child) {
      this._parse_node(child)
      child = child.nextSibling
    }
  }

  _parse_node (node) {
    node._container = this

    let type = node.nodeType
    if (type === node.TEXT_NODE) {
      this._parse_node_text(node)
      return
    }
    if (type === node.DOCUMENT_FRAGMENT_NODE) {
      this._parse_node_fragment(node)
      return
    }
    if (type === node.ELEMENT_NODE) {
      this._parse_node_element(node)
      return
    }
  }

  _parse_node_text (node) {
    let text = node.textContent.trim()
    if (text === '') {
      return
    }
    if (this._is_expression(text)) {
      let template = document.createElement('template-text')
      template._container = this
      template.setAttribute('text', text)
      this._parse_node(template)
      node.parentNode.insertBefore(template, node)
      node.remove()
    }
  }

  _parse_node_fragment (node) {
    let child = node.firstChild
    while (child) {
      this._parse_node(child)
      child = child.nextSibling
    }
  }

  _parse_node_element (node) {
    node._directives = {}

    this._parse_node_attributes(node)

    let child = node.firstChild;
    while (child) {
      this._parse_node(child);
      child = child.nextSibling;
    }
  }

  _parse_node_attributes (node) {
    let attributes = node.attributes
    let n = attributes.length

    for (let i = 0; i < n; i++) {
      let attribute = attributes[i]

      let name = attribute.name
      let value = attribute.value

      if (this._is_expression(value)) {
        let getter = this._parse_expression(value)
        let directive = function (data) {
          this[name] = getter(data)
        }
        node._directives[name] = directive
        continue
      }

      if (this._is_event(name)) {
        let event_name = this._parse_event(name)
        if (!this._listeners[event_name]) {
          this._listeners[event_name] = true
          this.shadowRoot.addEventListener(event_name, this._listener, false)
        }
      }
    }
  }

  _parse_expression (expression) {
    let length = expression.length
    let first_char = this.EXPRESSION_BEGIN.length
    let last_char = length - this.EXPRESSION_END.length
    let path = expression.substring(first_char, last_char)

    let parts = path.split('.')
    let n = parts.length

    if (n == 1) {
      return function (value) {
        return value[path]
      }
    }

    return function (value) {
      for (let i = 0; i < n && value; i++) {
        let part = parts[i]
        value = value[part]
      }
      return value
    }
  }

  set_props (props) {
    for (let name in props) {
      let prop = props[name]
      let value = prop.value
      if (this.hasAttribute(name)) {
        value = this.getAttribute(name)
      }
      if (value !== undefined) {
        this[name] = value
      }
    }
  }

  render (data) {
    this._render_node_children(this.shadowRoot, data)
  }

  _render_node_children (node, data) {
    let child = node.firstElementChild
    while (child) {
      this._render_node(child, data)
      child = child.nextElementSibling
    }
  }

  _render_node (node, data) {
    data = data || this

    if (node.nodeType !== node.ELEMENT_NODE) {
      return
    }


    let directives = node._directives
    if (directives) {
      for (let name in directives) {
        let directive = directives[name]
        directive.call(node, data)
      }
    }

    this._render_node_children(node, data)

    if (node.render) {
      node.context = Object.assign(node.context || {}, this.context)
      node.render()
      // node.render(data)
    }
  }

  _cache_refs () {
    let refs = {}
    let nodes = this.shadowRoot.querySelectorAll('[ref]')
    for (let i = 0, n = nodes.length; i < n; i++) {
      let node = nodes[i]
      let ref = node.getAttribute('ref')
      node.ref = ref
      refs[ref] = node
    }
    this.refs = refs
  }

  should_update () {
    return true
  }

  before_update () {}

  update () {
    let pass = this.should_update()
    if (!pass) {
      return
    }
    this.before_update()
    this.render()
  }

  fire (type, detail) {
    let config = { bubbles: true, cancelable: true, detail: detail }
    let event = new CustomEvent(type, config)
    this.dispatchEvent(event)
    return this
  }

  action (name, data) {
    this.fire('action', { name: name, data: data })
    return this
  }

  async (f) {
    requestAnimationFrame(f.bind(this))
  }

  createdCallback () {
    this._listener = this._listener.bind(this)

    this.createShadowRoot()

    let name = this.localName
    let template = templates[name]
    let content = template.content

    let node = document.importNode(content, true)
    this.shadowRoot.appendChild(node)

    this.set_props(this.props)
    this.setup()
    this._cache_refs()
    this.after_create()
  }

  attachedCallback () {
    this._prepare_style()
    this.update()
    this.after_connect()
  }

  _prepare_style () {
    let stylesheets = this.shadowRoot.querySelectorAll('link[rel="stylesheet"]')
    Array.from(stylesheets).forEach((stylesheet) => {
      let href = stylesheet.getAttribute('href')
      Pantarei.stylesheets[href].then((style) => {
        let stylenode = document.importNode(style, true)
        this.shadowRoot.insertBefore(stylenode, stylesheet)
        ShadyCSS.applyStyle(this, this.shadowRoot)
      })
    })
    ShadyCSS.applyStyle(this, this.shadowRoot)
  }

  after_create () {}

  after_connect () {}

  detachedCallback () {}

  connectedCallback () {}

  disconnectedCallback () {}

  attributeChangedCallback () {}

}

class TemplateRepeat extends HTMLElement {

  createdCallback () {
    this._setup()
  }

  _setup () {
    let template = this.querySelector('template')
    this._template = document.importNode(template, true)

    let stage = document.createDocumentFragment()
    let content = this._template.content
    let node = content.children[0]

    stage.appendChild(node)
    this._node = node.cloneNode(true)
    content.appendChild(node)

    this._item_name = this.getAttribute('item') || 'item'
    this._index_name = this.getAttribute('index') || 'index'

    this._items = []
    this._clones = []

    this.style.display = 'none'
  }

  _create_clone (index) {
    let clone = this._node.cloneNode(true)
    this.parentNode.insertBefore(clone, this)
    this._container._parse_node(clone)
    this._clones[index] = clone
  }

  _render_clone (index, data) {
    let clone = this._clones[index]
    let clone_data = Object.assign({}, data)
    let item = this.items[index]
    clone_data[this._item_name] = item
    clone_data[this._index_name] = index
    this._container._render_node(clone, clone_data)
  }

  _remove_clone (index) {
    let clone = this._clones[index]
    clone.remove()
    this._clones[index] = null
  }

  render (data) {
    let old_items = this._items || []
    let new_items = this.items

    if (!Array.isArray(new_items)) {
      new_items = []
    }

    this.items = new_items.slice()

    let old_items_count = old_items.length
    let new_items_count = new_items.length

    if (new_items_count < old_items_count) {
      for (let index = 0; index < new_items_count; index++) {
        this._render_clone(index, data)
      }
      for (let index = new_items_count; index < old_items_count; index++) {
        this._remove_clone(index)
      }
    }
    else {
      for (let index = 0; index < old_items_count; index++) {
        this._render_clone(index, data)
      }
      for (let index = old_items_count; index < new_items_count; index++) {
        this._create_clone(index)
        this._render_clone(index, data)
      }
    }

    this._items = this.items
  }

}

document.registerElement('template-repeat', TemplateRepeat)

class TemplateIf extends HTMLElement {

  createdCallback () {
    this._setup()
  }

  _setup () {
    let template = this.querySelector('template')
    this._template = document.importNode(template, true)

    let stage = document.createDocumentFragment()
    let content = this._template.content
    let node = content.children[0]

    stage.appendChild(node)
    this._node = node.cloneNode(true)
    content.appendChild(node)

    this._clone = null;
    this.style.display = 'none'
  }

  _create_clone () {
    let clone = this._node.cloneNode(true)
    this._container.parse_node(clone)
    this.parentNode.insertBefore(clone, this)
    this._clone = clone
  }

  _render_clone () {
    // this._clone.render()
  }

  _remove_clone () {
    this._clone.remove();
    this._clone = null
  }

  render () {
    let old_test = this._test
    let new_test = this.test

    if (new_test) {
      if (old_test) {
        this._render_clone()
      } else {
        this._create_clone()
        this._render_clone()
      }
    } else {
      if (old_test) {
        this._remove_clone()
      }
    }
  }

}

document.registerElement('template-if', TemplateIf)

class TemplateText extends HTMLElement {

  createdCallback () {
    this._setup()
  }

  _setup () {
    this._node = document.createTextNode('')
    let directive = function (data) {
      this._node.textContent = this.text
    }
    this.directive = directive
    this.style.display = 'none'
  }

  attachedCallback () {
    this.parentNode.insertBefore(this._node, this)
  }

  render (data) {
    if (!this.directive) return
    this.directive.call(this, data)
  }

}

document.registerElement('template-text', TemplateText)

window['Pantarei'] = {
  Element,
  TemplateElement,
  TemplateRepeat,
  TemplateIf,
  TemplateText,
  stylesheets,
  templates
}