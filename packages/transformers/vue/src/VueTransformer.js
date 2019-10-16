// @flow
import type {Meta} from '@parcel/types';

import path from 'path';
import {Transformer} from '@parcel/plugin';
import t from '@babel/types';

export default new Transformer({
  async getConfig({asset}) {
    return asset.getConfig(['.vuerc', '.vuerc.js'], {
      packageKey: 'stylus'
    });
  },

  async transform({asset, options, config}) {
    const parse = await this.getParser(options.packageManager, asset.filePath);

    const {template, script, styles} = parse({
      source: await asset.getCode(),
      needMap: false
    });

    const assets = [];
    if (template && template.content) {
      assets.push({
        meta: ({vueType: 'template', vueAttrs: template.attrs}: Meta),
        type: template.lang || 'html',
        code: template.content || ''
      });
    }

    assets.push(
      script
        ? {
            meta: ({vueType: 'script', vueAttrs: script.attrs}: Meta),
            type: script.lang || 'js',
            code: script.content
          }
        : {
            meta: ({vueType: 'script'}: Meta),
            type: 'js',
            code: ''
          }
    );

    for (const style of styles) {
      if (style.content) {
        assets.push({
          meta: ({vueType: 'style', vueAttrs: style.attrs}: Meta),
          type: style.lang || 'css',
          code: style.content
        });
      }
    }

    // TODO: custom blocks based on vue config
    return assets;
  },

  async postProcess({assets, options}) {
    const templateAsset = assets.find(a => a.meta.vueType === 'template');
    const scriptAsset = assets.find(a => a.meta.vueType === 'script');
    const styleAssets = assets.filter(a => a.meta.vueType === 'style');

    let renderCode = '';
    if (templateAsset) {
      const compileTemplate = await this.getTemplateCompiler(
        options.packageManager,
        templateAsset.filePath
      );

      const {code, source, tips, errors} = compileTemplate({
        source: await templateAsset.getCode(),
        filename: templateAsset.filePath
        // compilerOptions,
        // // allow customizing behavior of vue-template-es2015-compiler
        // transpileOptions: options.transpileOptions,
        // transformAssetUrls: options.transformAssetUrls || true,
        // isProduction,
        // isFunctional,
        // optimizeSSR: isServer && options.optimizeSSR !== false,
        // prettify: options.prettify
      });
      renderCode = code;
    }

    if (!scriptAsset) {
      return [];
    }
    const scriptCode = await scriptAsset.getCode();
    const finalCode = this.injectRenderCode(scriptCode, renderCode);

    return [
      {
        type: 'js',
        code: finalCode
      }
    ];
  },

  async getParser(packageManager, filePath) {
    const {compilerUtils, compiler} = await this.getVueDeps(
      packageManager,
      filePath
    );

    return opts =>
      compilerUtils.parse({
        filename: filePath,
        sourceRoot: path.dirname(filePath),
        compiler,
        ...opts
      });
  },

  async getTemplateCompiler(packageManager, filePath) {
    const {compilerUtils, compiler} = await this.getVueDeps(
      packageManager,
      filePath
    );

    return opts =>
      compilerUtils.compileTemplate({
        filename: filePath,
        compiler,
        ...opts
      });
  },

  async getVueDeps(packageManager, filePath) {
    const [compilerUtils, compiler] = await Promise.all([
      packageManager.require('@vue/component-compiler-utils', filePath),
      packageManager.require('vue-template-compiler', filePath)
    ]);
    return {compilerUtils, compiler};
  },

  injectRenderCode(scriptCode, renderCode) {
    if (!renderCode) {
      return scriptCode;
    }
    return `
      ${scriptCode}
      ${renderCode}
      const __parcel_vue_exports = module && module.exports && module.exports.default || module.exports
      __parcel_vue_exports && typeof __parcel_vue_exports === 'object' && (__parcel_vue_exports.render = render) && (__parcel_vue_exports.staticRenderFns = staticRenderFns)
    `;
  }
});
