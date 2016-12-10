'use babel';

import { CompositeDisposable } from 'atom';
import ambientLight from 'ambient-light-sensor';
import css from 'css';
// import Color from 'color';
const Color = require('color');

function getActiveTheme() {
  return atom.themes.getActiveThemes()
  .find(theme => theme.stylesheets[0][1].includes(':host'));
}

function getStyles(theme) {
  return theme.stylesheets[0][1];
}

function getAst(styles) {
  return css.parse(styles);
}

function invertColors(source, percentage = 1) {
  try {
    return Color(source).mix(Color(source).negate(), percentage).hex();
  } catch (error) {
    return source;
  }
}

function transformAst(source, lightLevel) {
  return {
    ...source,
    stylesheet: {
      ...source.stylesheet,
      rules: source.stylesheet.rules.map(rule => ({
        ...rule,
        declarations: rule.declarations.reduce((result, declaration) => {
          if (declaration.property === 'background' || declaration.property === 'background-color' || declaration.property === 'color') {
            return [
              ...result,
              {
                ...declaration,
                value: invertColors(declaration.value, (1 - lightLevel))
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
  stylesheet: null,
  timer: 0,
  config: {
    pollRate: {
      description: 'The frequency (in milliseconds) at which the ambient light level should be polled',
      type: 'integer',
      default: 1000,
      minimum: 60,
      maximum: 30000
    }
  },

  activate() {
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      atom.commands.add('atom-workspace', {
        'atom-ambient-light:toggle': () => this.toggle(),
        'atom-ambient-light:update': () => this.update()
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
      this.stylesheet = atom.styles.addStyleSheet(styles);
      this.stylesheet.dispose();
    } else {
      const ast = getAst(styles);
      this.timer = setInterval(() => {
        this.transformStyles(ast);
      }, atom.config.get('atom-ambient-light.pollRate'));
    }
  },

  update() {
    const styles = getStyles(getActiveTheme());
    const ast = getAst(styles);
    this.transformStyles(ast);
  },

  transformStyles(ast) {
    ambientLight((error, data) => {
      if (error) return console.error(error);
      console.log(`Ambient light: ${data.computedValue}`);
      const styles = css.stringify(transformAst(ast, data.computedValue));
      this.stylesheet = atom.styles.addStyleSheet(styles);
    });
  }

};
