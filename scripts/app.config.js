// app.config.js 是应用的配置文件，用于配置应用的ID、环境、点火等。 特别注意: 该文件必需为js 
const path = require('path');
const packageConfig = require(path.resolve(__dirname, './package.json'));
function standardEnv(env) {
    const ENV_MAP = {
        'dev': 'fws',
        'fat': 'fws',
        'fws': 'fws',
        'uat_nt': 'uat',
        'uat': 'uat',
        'lpt': 'lpt',
        'pro': 'pro',
        'prod': 'pro',
        'prd': 'pro',
    };
    env = env && env.toLowerCase();
    return ENV_MAP[env] || env
}
module.exports={
    AppID:packageConfig.AppID, // 应用ID，必需配置，必需与package.json中的AppID一致
    Env:standardEnv(packageConfig.config.env), //【可选】该配置项是可选参数，默认从系统中获取env； 如果配置了该选项，env必需从package.json中获取, 如果本地测试需要切换环境，请在package.json中修改config.env
    'vi.ignite':true, //【可选】 是否开启vi点火，推荐开启业务有需要在点火阶段执行逻辑可配置点火组件支持；当该配置为false或省略该配置项时应用需自己支持点火接口，否则应用无法发布成功
    qconfig:[ //【可选】 该配置项是可选参数，当配置该项并 'vi.ignite':true 时，默认会在点火获取该文件，如果获取失败则点火失败即健康检查路径失败，
    ]
};
