# jmResourceLoad-webpack-plugin
webpack4 资源加载改成ajax请求


webpack中的js加载默认用的是`script`标签， 本插件会把它替换成`ajax`拉取再eval。
支持失败重载和`localStorage`缓存js

> 因为是ajax请求js, 需要配置跨域头: Access-Control-Allow-Origin。

# 安装
```js
npm i resource-load-webpack-plugin --save-dev
```

# 使用

```js
const jmResourceLoadPlugin = require('resource-load-webpack-plugin');

plugins: [
   new jmResourceLoadPlugin({
        // 加载完成回调，可以注入一段js，用户加载完成的一个自定义逻辑，比较上报日志等，非必须
        // type: 'success' | 'fail' | 'timeout',   url: 资源地址, xhr： 加载资源的ajax对象或script标签       
        // retryTime 如果指定了重试参数，这里表示当前是第几次重试，正常加载是0，后面累加
        loadCompleteTemplate: `console.log('load:', type, url, xhr, retryTime)`,
        // 加载前处理逻辑，可以针对加载url初始化
        // 这里的是当加载失败时，去除域名，改为从主站获取，如果不需要请删除这里
         // loadType: 'ajax' | 'script' 支持ajax和script加载，可以根据条件修改这个变量 默认 ajax
         // url  当前加载的地址
        loadBeforeTemplate: `
                            if(retryTime > 0) url = url.replace(/^(http(s)?:)?\\/\\/[^\\/]+/i, '');
                            loadType='ajax';
                        `,
        // 失败重试次数，默认2, 最大只能5次，否则采用5
        retryTime: 2,
        // 是否用于加载CSS
        cssLoad: false,
        // 缓存url的正则, 不配置就不进行local缓存
        // 请保证唯一性，key会当作缓存的key，比如下面示例的 chunk-common
        // 可以在正式环境才缓存，开发环境请不要配置，不然不好调试
        localCacheRegs: process.env.NODE_ENV === 'production'?
        {
            "chunk-common.js": /js\/chunk-common/i,
            "index.js": /js\/index/i,   
            "chunk-common.css": /css\/chunk-common/i,
        }: null
    }),
]
```

