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
    new jmResourceLoadPlugin(),
]
```

