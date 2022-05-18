# jmResourceLoad-webpack-plugin
webpack4 资源加载改成ajax请求


webpack中的js加载默认用的是`script`标签， 本插件会把它替换成ajax拉取再eval。

# 安装
```js
npm i jmResourceLoad-webpack-plugin --save-dev
```

# 使用

```js
const jmResourceLoadPlugin = require('jmResourceLoad-webpack-plugin');

plugins: [
   new jmResourceLoadPlugin({
        // 加载完成回调，可以注入一段js，用户加载完成的一个自定义逻辑，比较上报日志等，非必须
        // type: 'success' | 'fail' | 'timeout',   url: 资源地址, xhr： 加载资源的ajax对象
        loadCompleteTemplate: `console.log('load:', type, url, xhr)`,
        // 缓存url的正则， 不配置就不缓存
        localCacheRegs: [
            /js\/chunk-common/i,
            /js\/index/i,                        
        ]
    }),
]
```

