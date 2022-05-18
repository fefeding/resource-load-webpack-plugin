const webpack = require("webpack");
class JTResourceLoad {
  constructor(option = {}) {
      // 加载资源完成回调
      option.loadCompleteTemplate = option.loadCompleteTemplate || `console.log('load:', type, url)`;
      // 缓存url的正则
      if(typeof option.localCacheRegs === 'undefined') option.localCacheRegs = [];
      this.option = option;
  }
  apply(compiler) {
        compiler.hooks.compilation.tap("JT_JsonpTemplatePlugin", compilation => {
        const { Template } = webpack;
        const { mainTemplate } = compilation;
        const chunkLoadTimeout = mainTemplate.outputOptions.chunkLoadTimeout;
        // 是否需要缓存
        const isLocalCache = Array.isArray(this.option.localCacheRegs) && this.option.localCacheRegs.length;
        
        const cacheRegRules = [
            "var isMatch = false;"
        ];
        // 命中规则的才缓存
        if(isLocalCache) {
            for(const r of this.option.localCacheRegs) {
                cacheRegRules.push(`if(${typeof r ==='string'?r:r.toString()}.test(url)) isMatch = true;`);
            }
        }

        const cacheFun = [
            "function jt_LoadResource_cache(url, data) {",
                    Template.indent([
                        ...cacheRegRules,
                        "if(!window.localStorage || !isMatch) return null;",
                        "if(typeof data === 'undefined') return window.localStorage.getItem(url);",
                        "else window.localStorage.setItem(url, data);"
                    ]),
                "}"
            ];

        // 注入ajax函数，用于资源拉起
        mainTemplate.hooks.localVars.tap(
			"JT_JsonpMainTemplatePlugin",
			(source, chunk, hash) => {
				return Template.asString([
                    source,
                    "function jt_LoadResource_complete(type, url, xhr) {",
                        Template.indent([
                            this.option.loadCompleteTemplate
                        ]),
                    "}",
                    
                    ...(isLocalCache ? cacheFun: []),

                    "function jt_LoadResource(url, callback) {",
                        isLocalCache? "var text = jt_LoadResource_cache(url); if(text) return text;" : "",
                        "var xhr = new XMLHttpRequest();",
                        "xhr.onreadystatechange = function() {",
                            Template.indent([
                                "if(xhr.readyState==4) {",
                                    Template.indent([
                                        "clearTimeout(timeoutHandler);",
                                        "if(xhr.status==200) {",
                                            Template.indent([
                                                // 缓存
                                                isLocalCache? "jt_LoadResource_cache(url, xhr.responseText);" : "",
                                                "callback({ type: 'load', url: url, text: xhr.responseText });",
                                                "jt_LoadResource_complete('success', url, xhr);"
                                            ]),
                                        "}",
                                        "else {",
                                            "callback({ type: 'fail', url: url });",
                                            "jt_LoadResource_complete('fail', url, xhr);",
                                        "}"
                                    ]),
                                "}",
                            ]),
                        "};",
                        "xhr.open('GET', url, true);",
                        "xhr.send(null);",
                        "var timeoutHandler = setTimeout(function(){",
                        Template.indent([
                            "callback({ type: 'timeout', url: url });",
                            "jt_LoadResource_complete('timeout', url, xhr);",
                        ]),
                        `}, ${chunkLoadTimeout});`,
                    "}"
                ]);
			}
		);
        // 覆盖加载核心逻辑
        if(mainTemplate.hooks.jsonpScript && mainTemplate.hooks.jsonpScript.taps) {
            for(const tap of mainTemplate.hooks.jsonpScript.taps) {
                
                if(tap.name === 'JsonpMainTemplatePlugin') {
                    console.log('replace JsonpMainTemplatePlugin tap', tap);
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
                            "jt_LoadResource(jsonpScriptSrc(chunkId), function(data) {",
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
    });
  }
}
module.exports = JTResourceLoad;