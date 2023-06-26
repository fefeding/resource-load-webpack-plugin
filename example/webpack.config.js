const path = require('path');
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const ResourceLoadPlugin = require('../index.js');

module.exports = {
    entry: "./src/js/index.js",
    output: {
      path: path.join(__dirname, "./dist"),
      // 会产生 main.js  other.js两个文件
      filename: "js/[name].js",
    },
    mode: 'production',
    plugins: [
        new HtmlWebpackPlugin({
          template: path.join(__dirname, "src/index.html"),
          filename: "index.html",
          minify: false,
        }),
        new MiniCssExtractPlugin({
            filename: "css/[name].css",
          }),
          new ResourceLoadPlugin({
            globalScript: `
                console.log('global script 123');
            `,
            // 加载完成回调，可以注入一段js，用户加载完成的一个自定义逻辑，比较上报日志等，非必须
            // type: 'success' | 'fail' | 'timeout',   url: 资源地址, xhr： 加载资源的ajax对象
            // retryTime 如果指定了重试参数，这里表示当前是第几次重试，正常加载是0，后面累加
            loadCompleteTemplate: `if(retryTime > 0 || type !== 'success') {
                                       
                                    console.log('retryTime>0表示是重试回调，可以进行上报。');
                                    
                                    }`,
            // 加载前处理逻辑，可以针对加载url初始化
            // 这里的是当加载失败时，去除域名，改为从主站获取，如果不需要请删除这里
            // loadType: 'ajax' | 'tag' 支持ajax和script加载，可以根据条件修改这个变量  修改时最好判断下loadType是否为空，因为有些地方已经指定不要去修改它
            // url  当前加载的地址
            loadBeforeTemplate: `
                                console.log('可以通过判断retryTime>0表示是重试前，然后替换url中的域名跳过CDN。根据自已业务来处理');
            `,
            addScript: (opt)=>{
              return `console.log('load source function:', '${opt.loadResourceFun}')`;
            },
            // 失败重试次数，默认2, 最大只能5次，否则采用5
            retryTime: 3,
            // 是否用于加载CSS
            cssLoad: true,
            syncRunType: 'eval', // 可以用eval 或 tag，表示加载js用标签或eval来运行，区别不大
            syncLoadType: 'tag',// 这里不能用ajax，会导至加载慢
            syncLoadAsync: false, // 是否在script标签中加上async
            // 缓存url的正则, 不配置就不进行local缓存
            // 请保证唯一性，key会当作缓存的key，比如下面示例的 chunk-common
            // 可以在正式环境才缓存，开发环境请不要配置，不然不好调试
            localCacheRegs: {
                "main": /\/js\/main\./i,
                //"index.js": /\/js\/index\./i,   
            }
        })
      ],
    module:{
        rules:[
            { 
                test:/\.css$/, 
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader'
                ]
            }
       ]   
}
  };