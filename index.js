const webpack = require("webpack");

const pluginName = 'JT_JsonpTemplatePlugin';
const loadResourceFun = `${pluginName}_LoadResource`;
const loadResourceCacheFun = `${pluginName}_LoadResource_cache`;
const loadResourceCompleteFun = `${pluginName}_LoadResource_complete`;
const inlineJavascriptFun = `${pluginName}_InlineScript`;
const getJavascriptTagFun = `${pluginName}_GetScriptTagByUrl`;

class JTResourceLoad {
  constructor(option = {}) {
      // 加载前处理逻辑，可以针对加载url初始化
      option.loadBeforeTemplate = option.loadBeforeTemplate || `console.log(' start load:', url, retryTime)`;
      // 加载资源完成回调
      option.loadCompleteTemplate = option.loadCompleteTemplate || `console.log('load:', type, url, retryTime)`;
      // 失败重试次数
      if(typeof option.retryTime === 'undefined') option.retryTime = 2;
      option.retryTime = Math.min(option.retryTime, 5);
      // 缓存url的正则
      if(typeof option.localCacheRegs === 'undefined') option.localCacheRegs = [];
      this.option = option;
  }
  apply(compiler) {
        compiler.hooks.compilation.tap(pluginName, compilation => {
            const { Template } = webpack;
            const { mainTemplate } = compilation;

            const alterAssetTagGroups = compilation.hooks.htmlWebpackPluginAlterAssetTags;
            const crossOriginLoading =
                        mainTemplate.outputOptions.crossOriginLoading;
            const chunkLoadTimeout = mainTemplate.outputOptions.chunkLoadTimeout;
            const jsonpScriptType = mainTemplate.outputOptions.jsonpScriptType;
            // 是否需要缓存
            const isLocalCache = !!this.option.localCacheRegs;


            const cacheRegRules = [
                "var isMatch = false; var cacheName='jt_resource_cache_' + url;"
            ];
            // 命中规则的才缓存
            if(isLocalCache) {
                for(const k in this.option.localCacheRegs) {
                    const r = this.option.localCacheRegs[k];
                    if(!r) continue;
                    cacheRegRules.push(`if(!isMatch && ${typeof r ==='string'?r:r.toString()}.test(url)) {isMatch = true; cacheName='jt_resource_cache_${k}';}`);
                }
            }

            const cacheFun = [
                `function ${loadResourceCacheFun}(url, data) {`,
                        Template.indent([
                            "try {",
                            ...cacheRegRules,
                            "if(!window.localStorage || !isMatch) return null;",
                            "if(typeof data === 'undefined') {",
                                "var text = window.localStorage.getItem(cacheName);",
                                // 当缓存中的url是当前url才表示命中，否则为不同版本，不能采用
                                "if(text && text.indexOf('//' + url) === 0) return text;",
                            "}",
                            "else window.localStorage.setItem(cacheName, '//' + url + '\\n' + data);",
                            "} catch(e) {console.error(e);",
                                "if(e.name === 'QuotaExceededError') {",
                                    "window.localStorage.clear && window.localStorage.clear();",
                                "}",
                            "}"
                        ]),
                    "}"
                ];
            // 加载JS逻辑
            const loadResourceScript = Template.asString([
                    `function ${loadResourceCompleteFun}(type, url, xhr, retryTime) {`,
                        Template.indent([
                            "try{",
                            this.option.loadCompleteTemplate,
                            "}catch(e){console.error(e);}"
                        ]),
                    "}",
                    
                    ...(isLocalCache ? cacheFun: []),

                    `function ${loadResourceFun}(url, callback, retryTime, loadType) {`,
                        "retryTime = typeof retryTime !== 'number'?0: retryTime",
                        isLocalCache? `if(retryTime == 0) {var text = ${loadResourceCacheFun}(url); if(text) {callback && callback({ type: 'load', url: url, retryTime: retryTime, text: text }); return text;}}` : "",
                        "loadType = loadType || 'ajax';// ajax || script",
                        "try{",
                        this.option.loadBeforeTemplate,
                        "}catch(e){console.error(e);}",
                        "if(loadType == 'ajax') {",
                        "var xhr = new XMLHttpRequest();",
                        "xhr.onreadystatechange = function() {",
                            Template.indent([
                                "if(xhr.readyState==4) {",
                                    Template.indent([
                                        "clearTimeout(timeoutHandler);",
                                        "if(xhr.status==200) {",
                                            Template.indent([
                                                // 缓存
                                                isLocalCache? `if(retryTime == 0) ${loadResourceCacheFun}(url, xhr.responseText);` : "",
                                                "callback({ type: 'load', url: url, retryTime: retryTime, text: xhr.responseText });",
                                                `${loadResourceCompleteFun}('success', url, xhr, retryTime);`
                                            ]),
                                        "}",
                                        "else {",
                                            `if(retryTime < ${this.option.retryTime}) { ${loadResourceFun}(url, callback, retryTime+1); return;}`,
                                            "callback({ type: 'fail', url: url, retryTime: retryTime });",
                                            `${loadResourceCompleteFun}('fail', url, xhr, retryTime);`,
                                        "}"
                                    ]),
                                "}",
                            ]),
                        "};",
                        "xhr.open('GET', url, true);",
                        "xhr.send(null);",
                        "}",
                        "else {",
                            "var script = document.createElement('script');",
                            jsonpScriptType
                                ? `script.type = ${JSON.stringify(jsonpScriptType)};`
                                : "",
                            "script.charset = 'utf-8';",
                            `script.timeout = ${chunkLoadTimeout / 1000};`,
                            `if (${mainTemplate.requireFn}.nc) {`,
                            Template.indent(
                                `script.setAttribute("nonce", ${mainTemplate.requireFn}.nc);`
                            ),
                            "}",
                            "script.src = url",
                            crossOriginLoading
                                ? Template.asString([
                                        "if (script.src.indexOf(window.location.origin + '/') !== 0) {",
                                        Template.indent(
                                            `script.crossOrigin = ${JSON.stringify(crossOriginLoading)};`
                                        ),
                                        "}"
                                ])
                                : "",
                            "script.onerror = function(e){",
                                "clearTimeout(timeoutHandler);",
                                `if(retryTime < ${this.option.retryTime}) { ${loadResourceFun}(url, callback, retryTime+1); e.stopPropagation && e.stopPropagation(); return;}`,
                                "callback({ type: 'fail', url: url, retryTime: retryTime });",
                                `${loadResourceCompleteFun}('fail', url, this, retryTime);`,
                            "}",
                            "script.onload = function(e){",
                                "clearTimeout(timeoutHandler);",
                                "callback({ type: 'load', url: url, retryTime: retryTime });",
                                `${loadResourceCompleteFun}('success', url, this, retryTime);`,
                            "}",
                            "document.head.appendChild(script);",
                        "}",
                        "var timeoutHandler = setTimeout(function(){",
                        Template.indent([
                            `if(retryTime < ${this.option.retryTime}) { ${loadResourceFun}(url, callback, retryTime+1); return;}`,
                            "callback({ type: 'timeout', url: url, retryTime: retryTime });",
                            `${loadResourceCompleteFun}('timeout', url, xhr||script, retryTime);`,
                        ]),
                        `}, ${chunkLoadTimeout});`,
                    "}",
                    `function ${inlineJavascriptFun}(js, url, tag){`,
                        "var script = document.createElement('script');",
                        "script.innerHTML=js;",
                        "url && script.setAttribute('data-src', url);",
                        "if(tag && tag.replaceWith) tag.replaceWith(script); else document.body.appendChild(script);",
                    "}",
                    `function ${getJavascriptTagFun}(url){`,
                        "var tags = document.getElementsByTagName('script');if(!tags) return null;",
                        "for(var i=0;i<tags.length;i++){",
                            `var tag=tags[i];
                            if(tag && tag.attributes) { 
                                for(var j=0;j<tag.attributes.length;j++){ 
                                    var attr = tag.attributes[j];
                                    if((attr.name==='src'||attr.name==='data-src') && attr.value===url){
                                        return tag;
                                    }
                                }
                            }`,
                        "}",
                    "}",
                ]);

            // 注入ajax函数，用于资源拉起
            mainTemplate.hooks.localVars.tap(
                pluginName,
                (source, chunk, hash) => {
                   return Template.asString([
                    source,
                    alterAssetTagGroups?"":loadResourceScript
                   ]);
                }
            );
            // 覆盖加载核心逻辑
            if(mainTemplate.hooks.jsonpScript && mainTemplate.hooks.jsonpScript.taps) {
                for(const tap of mainTemplate.hooks.jsonpScript.taps) {
                    
                    if(tap.name === 'JsonpMainTemplatePlugin') {
                        //console.log('replace JsonpMainTemplatePlugin tap', tap);
                        tap.fn = (source, chunk, hash) => {
                            return Template.asString([                            
                                "var onScriptComplete;",
                                "// jt: create error before stack unwound to get useful stacktrace later",
                                "var error = new Error();",
                                "onScriptComplete = function (event) {",
                                Template.indent([
                                    "// avoid mem leaks in IE.",
                                    "var chunk = installedChunks[chunkId];",
                                    "if(chunk !== 0) {",
                                    Template.indent([
                                        "if(chunk) {",
                                        Template.indent([
                                            "var errorType = event && (event.type === 'load' ? 'missing' : event.type);",
                                            "var realSrc = event && event.url;",
                                            "error.message = 'Loading chunk ' + chunkId + ' failed.\\n(' + errorType + ': ' + realSrc + ')';",
                                            "error.name = 'ChunkLoadError1';",
                                            "error.type = errorType;",
                                            "error.request = realSrc;",
                                            "chunk[1](error);"
                                        ]),
                                        "}",
                                        "installedChunks[chunkId] = undefined;"
                                    ]),
                                    "}"
                                ]),
                                "};",
                                `${loadResourceFun}(jsonpScriptSrc(chunkId), function(data) {`,
                                    Template.indent([
                                        "if(data.type === 'load' && data.text) {",
                                            Template.indent([
                                                "eval(data.text);",
                                            ]),
                                        "}",
                                        "onScriptComplete(data);"
                                    ]),
                                "})",                            
                            ]);
                        }
                    }
                }
            }
            // 覆盖掉加载入口
            if(mainTemplate.hooks.requireEnsure && mainTemplate.hooks.requireEnsure.taps) {
                for(const tap of mainTemplate.hooks.requireEnsure.taps) {
                    if(tap.name === 'JsonpMainTemplatePlugin load') {
                        tap.fn = (source, chunk, hash) => {
                            return Template.asString([
                                source,
                                "",
                                "// JSONP chunk loading for javascript",
                                "",
                                "var installedChunkData = installedChunks[chunkId];",
                                'if(installedChunkData !== 0) { // 0 means "already installed".',
                                Template.indent([
                                    "",
                                    '// a Promise means "currently loading".',
                                    "if(installedChunkData) {",
                                    Template.indent(["promises.push(installedChunkData[2]);"]),
                                    "} else {",
                                    Template.indent([
                                        "// setup Promise in chunk cache",
                                        "var promise = new Promise(function(resolve, reject) {",
                                        Template.indent([
                                            "installedChunkData = installedChunks[chunkId] = [resolve, reject];"
                                        ]),
                                        "});",
                                        "promises.push(installedChunkData[2] = promise);",
                                        "",
                                        "// start chunk loading",
                                        mainTemplate.hooks.jsonpScript.call("", chunk, hash),
                                        //"document.head.appendChild(script);"
                                    ]),
                                    "}"
                                ]),
                                "}"
                            ]);
                        }
                    }
                }
            }

            // 处理同步JS
            if(alterAssetTagGroups) {
                alterAssetTagGroups.tap('JT_JsonpMainTemplatePlugin_scripts', (pluginArgs, callback) => {
                    const headTagName = Object.prototype.hasOwnProperty.call(pluginArgs, 'headTags') ? 'headTags' : 'head';
                    const bodyTagName = Object.prototype.hasOwnProperty.call(pluginArgs, 'bodyTags') ? 'bodyTags' : 'body';
                    const head = pluginArgs[headTagName] || (pluginArgs[headTagName]=[]);
                    const body = pluginArgs[bodyTagName] || (pluginArgs[bodyTagName]=[]);
                    // 注入一段加载脚本
                    head.push({
                        tagName: 'script',
                        closeTag: true,
                        innerHTML: loadResourceScript
                    });
                    // 同步加载的js加载方式
                    if(this.option.syncLoadType === 'ajax') {
                        const tags = [
                            ...head,
                            ...body
                        ];
                        for(const tag of tags) {
                            if(!tag || tag.tagName !== 'script' || !tag.attributes || !tag.attributes.src) continue;
                            const url = tag.attributes.src;
                            tag.innerHTML = Template.asString([
                                `${loadResourceFun}('${url}', function(data){`,
                                    Template.indent([
                                        "if(data.type === 'load' && data.text) {",
                                                Template.indent([
                                                    `var tag = ${getJavascriptTagFun}('${url}');`,
                                                    `${inlineJavascriptFun}(data.text, '${url}', tag);`
                                                ]),
                                            "}",
                                        ]),
                                "}, 0, 'ajax');"
                            ]);
                            tag.attributes['data-src'] = url;
                            delete tag.attributes.src;
                        }
                    }
                    if (callback) {
                        callback(null, pluginArgs);
                      }
                });
            }
        });
  }
}
module.exports = JTResourceLoad;