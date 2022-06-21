const webpack = require("webpack");
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
        compiler.hooks.compilation.tap("JT_JsonpTemplatePlugin", compilation => {
        const { Template } = webpack;
        const { mainTemplate } = compilation;
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
            "function jt_LoadResource_cache(url, data) {",
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

        // 注入ajax函数，用于资源拉起
        mainTemplate.hooks.localVars.tap(
			"JT_JsonpMainTemplatePlugin",
			(source, chunk, hash) => {
				return Template.asString([
                    source,
                    "function jt_LoadResource_complete(type, url, xhr, retryTime) {",
                        Template.indent([
                            "try{",
                            this.option.loadCompleteTemplate,
                            "}catch(e){console.error(e);}"
                        ]),
                    "}",
                    
                    ...(isLocalCache ? cacheFun: []),

                    "function jt_LoadResource(url, callback, retryTime) {",
                        isLocalCache? "var text = jt_LoadResource_cache(url); if(text) {callback && callback({ type: 'load', url: url, text: text }); return text;}" : "",
                        "retryTime = typeof retryTime !== 'number'?0: retryTime",
                        "var loadType = 'script';// ajax || script",
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
                                                isLocalCache? "jt_LoadResource_cache(url, xhr.responseText);" : "",
                                                "callback({ type: 'load', url: url, text: xhr.responseText });",
                                                "jt_LoadResource_complete('success', url, xhr, retryTime);"
                                            ]),
                                        "}",
                                        "else {",
                                            `if(retryTime < ${this.option.retryTime}) { jt_LoadResource(url, callback, retryTime+1); return;}`,
                                            "callback({ type: 'fail', url: url });",
                                            "jt_LoadResource_complete('fail', url, xhr, retryTime);",
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
                            "var onScriptComplete;",
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
                                `if(retryTime < ${this.option.retryTime}) { jt_LoadResource(url, callback, retryTime+1); return;}`,
                                "callback({ type: 'fail', url: url });",
                                "jt_LoadResource_complete('fail', url, this, retryTime);",
                            "}",
                            "script.onload = function(e){",
                                "clearTimeout(timeoutHandler);",
                                "callback({ type: 'load', url: url });",
                                "jt_LoadResource_complete('success', url, this, retryTime);",
                            "}",
                            "document.head.appendChild(script);",
                        "}",
                        "var timeoutHandler = setTimeout(function(){",
                        Template.indent([
                            `if(retryTime < ${this.option.retryTime}) { jt_LoadResource(url, callback, retryTime+1); return;}`,
                            "callback({ type: 'timeout', url: url });",
                            "jt_LoadResource_complete('timeout', url, xhr, retryTime);",
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