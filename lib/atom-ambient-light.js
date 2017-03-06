'use babel';

import { CompositeDisposable } from 'atom';
import ambientLight from 'ambient-light-sensor';
import css from 'css';
const Color = require('color');

function getActiveTheme() {
  return atom.themes.getActiveThemes().find(theme =>
    !theme.stylesheets[0][1].includes('atom-workspace')
  );
}

function getStyles(theme) {
  return theme.stylesheets[0][1];
}

function getAst(styles) {
  return css.parse(styles);
}

function invertColor(value, percentage = 1) {
  try {
    if (value === 'inherit') return value;
    if (value === 'currentColor') return 'transparent';
    if (value === 'transparent') return value;
    if (value.includes('!important')) {
      const importantColor = Color(value.replace(' !important', '')).mix(
        Color(value.replace(' !important', '')).negate(),
        percentage
      ).string();
      return `${importantColor} !important`;
    }
    return Color(value).mix(Color(value).negate(), percentage).string();
  } catch (error) {
    console.error(error);
    return value;
  }
}

function transformAst(ast, lightLevel) {
  function normalize(value) {
    if (value < 0.5) {
      return value ** 2;
    } else {
      return Math.sqrt(value);
    }
  }
  const background = ast.stylesheet.rules.find(rule =>
    rule.selectors && rule.selectors.includes('atom-text-editor')
  ).declarations.find(declaration =>
    declaration.property.includes('background')
  ).value;
  const percentage = Color(background).dark()
    ? (1 - normalize(lightLevel))
    : normalize(lightLevel);
  return {
    ...ast,
    stylesheet: {
      ...ast.stylesheet,
      rules: ast.stylesheet.rules && ast.stylesheet.rules.map(rule => ({
        ...rule,
        declarations: rule.declarations && rule.declarations.reduce((result, declaration) => {
          if (declaration.property === 'background' || declaration.property === 'background-color' || declaration.property === 'color') {
            return [
              ...result,
              {
                ...declaration,
                value: invertColors(declaration.value, percentage)
              }
            ];
          }
          return [...result, declaration];
        }, [])
      }))
    }
  };
}

export default {

  subscriptions: null,
  config: {
    pollRate: {
      description: 'The frequency (in milliseconds) at which the ambient light level should be polled',
      type: 'integer',
      default: 1000,
      minimum: 60,
      maximum: 30000
    }
  },
  stylesheet: null,
  ast: null,
  timer: 0,

  activate() {
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      atom.commands.add('atom-workspace', {
        'atom-ambient-light:toggle': () => this.toggle()
      }),
      atom.themes.onDidChangeActiveThemes(() => {
        const styles = getStyles(getActiveTheme());
        this.ast = getAst(styles);
      })
    );
  },

  deactivate() {
    this.subscriptions.dispose();
  },

  toggle() {
    const styles = getStyles(getActiveTheme());
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
      if (this.stylesheet) this.stylesheet.dispose();
    } else {
      this.ast = getAst(styles);
      this.timer = setInterval(() => {
        this.transformStyles();
      }, atom.config.get('atom-ambient-light.pollRate'));
    }
  },

  transformStyles() {
    ambientLight((error, data) => {
      if (error) return console.error(error);
      console.log(`Ambient light: ${data.computedValue}`);
      const styles = css.stringify(transformAst(this.ast, data.computedValue));
      if (this.stylesheet) this.stylesheet.dispose();
      this.stylesheet = atom.styles.addStyleSheet(styles);
    });
  }

};
