```js
new jmResourceLoadPlugin({
    globalScript: `
        window.is_debug = /debug=(1|2)/.test(location.href);
        if(window.is_debug) {
            window.__jtLogger && window.__jtLogger({
                'eventid': 'resource-loader-init',
                'level': 'debug',
                'content': document.cookie||'',
                'file': 'global'
            });
        }
    `,
    // 加载完成回调，可以注入一段js，用户加载完成的一个自定义逻辑，比较上报日志等，非必须
    // type: 'success' | 'fail' | 'timeout',   url: 资源地址, xhr： 加载资源的ajax对象
    // retryTime 如果指定了重试参数，这里表示当前是第几次重试，正常加载是0，后面累加
    loadCompleteTemplate: `if(retryTime > 0 || type !== 'success' || window.is_debug) {
                                window.__jtLogger && window.__jtLogger({
                                    'eventid': 'resource-loader',
                                    'level': type==='success'?'info':'error',
                                    'content': 'load:' + type + ',status:' + (xhr.statusText || xhr.status || '') + ',retryTime:' + retryTime + ',' + (type !=='success'&&xhr.status==200&&!xhr.responseText?'error:response is empty':''),
                                    'file': url
                                });
                            }
                            // 对于同步出来的js，采用判断模块是否存在判断加载成功与否
                            else if(xhr.tagName === 'SCRIPT') {
                                var moduleName = '';
                                if(/\\/js\\/([^\\.]+)\\./i.test(url)) {
                                    moduleName = RegExp.$1;
                                }
                                if(moduleName) {
                                    var loadSuccess = false;
                                    if(moduleName === 'index') {
                                        if(window.webpackInstalledChunks) {
                                            loadSuccess = true;
                                        }
                                    }
                                    else if(window.webpackJsonp) {
                                        for(var i=0;i<window.webpackJsonp.length;i++) {
                                            var arr = window.webpackJsonp[i];
                                            if(arr && arr.length) {
                                                if(arr[0] && arr[0][0] === moduleName) {
                                                    loadSuccess = true;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                    if(!loadSuccess) {
                                        console.log('check module fail', url, window.webpackJsonp);
                                        xhr.onerror.call(xhr, window.event);
                                        return;
                                    }
                                }
                            }`,
    // 加载前处理逻辑，可以针对加载url初始化
    // 这里的是当加载失败时，去除域名，改为从主站获取，如果不需要请删除这里
    // loadType: 'ajax' | 'tag' 支持ajax和script加载，可以根据条件修改这个变量  修改时最好判断下loadType是否为空，因为有些地方已经指定不要去修改它
    // url  当前加载的地址
    loadBeforeTemplate: `if((retryTime > 1 || window.is_debug) && url.indexOf('jt-static.ciccten.com') > -1) url = url.replace(/^(http(s)?:)?\\/\\/[^\\/]+/i, '')+'?__rt='+retryTime;
                        loadType = '${process.env.NODE_ENV === 'production'?'ajax':'tag'}';`,
    // 失败重试次数，默认2, 最大只能5次，否则采用5
    retryTime: 3,
    // 是否用于加载CSS
    cssLoad: true,
    syncRunType: process.env.NODE_ENV === 'production'?'eval':'tag',
    syncLoadType: 'tag',// 这里不能用ajax，会导至加载慢
    syncLoadAsync: false, // 是否在script标签中加上async
    // 缓存url的正则, 不配置就不进行local缓存
    // 请保证唯一性，key会当作缓存的key，比如下面示例的 chunk-common
    // 可以在正式环境才缓存，开发环境请不要配置，不然不好调试
    localCacheRegs: process.env.NODE_ENV === 'production'?
    {
        "chunk-common": /\/js\/chunk-common\./i,
        "vue-common-vendor": /\/js\/vue-common-vendor\./i,
        "chunk-vendors": /\/js\/chunk-vendors\./i,
        //"index.js": /\/js\/index\./i,   
    }: null
}),
```