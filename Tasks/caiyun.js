/**
彩云天气 v2.0 - 自动定位版
@author: majiqian5
更新地址：https://raw.githubusercontent.com/majiqian5/MyBoxJS/main/Tasks/caiyun.js
*/

// 初始化API
function initAPI() {
    if (typeof $task !== "undefined") {
        return {
            read: function(key) {
                // 优先从JSON对象读取
                if (key === "@caiyun.token.caiyun" || key === "caiyun_token") {
                    const caiyunJson = $prefs.valueForKey("caiyun");
                    if (caiyunJson) {
                        try {
                            const config = JSON.parse(caiyunJson);
                            if (config.token && config.token.caiyun) {
                                return config.token.caiyun;
                            }
                        } catch (e) {}
                    }
                    return $prefs.valueForKey("caiyun_token");
                }
                const cleanKey = key.startsWith("@") ? key.substring(1) : key;
                return $prefs.valueForKey(cleanKey);
            },
            write: function(value, key) {
                const cleanKey = key.startsWith("@") ? key.substring(1) : key;
                return $prefs.setValueForKey(value, cleanKey);
            },
            notify: $notify,
            log: (msg) => console.log(`[彩云天气] ${msg}`),
            error: (msg) => console.log(`[ERROR] ${msg}`),
            http: {
                get: (options) => {
                    return new Promise((resolve, reject) => {
                        $task.fetch({
                            url: options.url,
                            headers: options.headers || {},
                            timeout: options.timeout || 15000
                        }).then(response => {
                            resolve({ body: response.body });
                        }).catch(reject);
                    });
                }
            }
        };
    }
    return API("caiyun");
}

const $ = initAPI();

// 主函数
!(async () => {
    console.log("=== 彩云天气自动定位版 ===");
    
    // 1. 获取配置
    const config = getConfig();
    
    // 2. 自动获取位置
    const location = await getAutoLocation();
    
    // 3. 查询天气
    try {
        const weather = await queryWeather(config.caiyun_token, location);
        await showWeather(weather, location);
    } catch (error) {
        console.error("获取天气失败:", error.message);
        $.notify("[彩云天气]", "❌ 错误", error.message);
    }
})();

// 获取配置
function getConfig() {
    let config = {
        caiyun_token: "",
        tencent_token: "",
        tts_enabled: true,
        minutely_enabled: true
    };
    
    // 从JSON对象读取
    const caiyunJson = $.read("caiyun");
    if (caiyunJson) {
        try {
            const jsonConfig = JSON.parse(caiyunJson);
            if (jsonConfig.token) {
                config.caiyun_token = jsonConfig.token.caiyun || "";
                config.tencent_token = jsonConfig.token.tencent || "";
            }
        } catch (e) {}
    }
    
    // 如果没读取到，使用备用Token
    if (!config.caiyun_token) {
        config.caiyun_token = $.read("caiyun_token") || "bsyrOFGNeuvXcfqe";
    }
    
    console.log(`使用Token: ${config.caiyun_token.substring(0, 5)}...`);
    return config;
}

// 自动获取位置
async function getAutoLocation() {
    console.log("📍 开始获取位置...");
    
    // 1. 先尝试从存储读取
    const stored = $prefs.valueForKey("location");
    if (stored) {
        try {
            const location = JSON.parse(stored);
            if (location.latitude && location.longitude) {
                console.log(`✅ 从存储读取位置: ${location.latitude}, ${location.longitude}`);
                return location;
            }
        } catch (e) {}
    }
    
    // 2. 尝试IP定位
    console.log("尝试IP定位...");
    try {
        const ipLocation = await getIPLocation();
        if (ipLocation) {
            console.log(`🌐 IP定位成功: ${ipLocation.latitude}, ${ipLocation.longitude}`);
            console.log(`位置: ${ipLocation.city || "未知"}`);
            
            // 保存位置
            $prefs.setValueForKey(JSON.stringify(ipLocation), "location");
            
            $.notify(
                "[彩云天气] 自动定位",
                "📍 定位成功",
                `位置: ${ipLocation.city || "未知地区"}\n经纬度: ${ipLocation.latitude}, ${ipLocation.longitude}`
            );
            
            return ipLocation;
        }
    } catch (error) {
        console.log("IP定位失败:", error.message);
    }
    
    // 3. 使用默认位置
    const defaultLocation = {
        latitude: 39.9042,
        longitude: 116.4074,
        city: "北京",
        source: "默认"
    };
    
    console.log(`🗺️ 使用默认位置: 北京`);
    return defaultLocation;
}

// IP定位
async function getIPLocation() {
    try {
        const response = await $task.fetch({
            url: "https://api.ip.sb/geoip",
            timeout: 5000
        });
        
        const geoData = JSON.parse(response.body);
        
        if (geoData.latitude && geoData.longitude) {
            return {
                latitude: parseFloat(geoData.latitude),
                longitude: parseFloat(geoData.longitude),
                city: geoData.city,
                region: geoData.region,
                country: geoData.country,
                source: "IP定位"
            };
        }
    } catch (error) {
        console.log("IP定位API1失败:", error.message);
    }
    
    // 备用API
    try {
        const response = await $task.fetch({
            url: "https://ipapi.co/json/",
            timeout: 5000
        });
        
        const geoData = JSON.parse(response.body);
        
        if (geoData.latitude && geoData.longitude) {
            return {
                latitude: parseFloat(geoData.latitude),
                longitude: parseFloat(geoData.longitude),
                city: geoData.city,
                region: geoData.region,
                country: geoData.country_name,
                source: "备用IP定位"
            };
        }
    } catch (error) {
        console.log("IP定位API2失败:", error.message);
    }
    
    return null;
}

// 查询天气
async function queryWeather(token, location) {
    const url = `https://api.caiyunapp.com/v2.5/${token}/${location.longitude},${location.latitude}/weather?lang=zh_CN`;
    
    console.log(`🌐 查询天气: ${url.substring(0, 60)}...`);
    
    const response = await $task.fetch({ 
        url: url,
        timeout: 10000 
    });
    
    const data = JSON.parse(response.body);
    
    if (data.status === "failed") {
        throw new Error(`彩云API错误: ${data.error || "未知错误"}`);
    }
    
    console.log("✅ 天气数据获取成功");
    return data;
}

// 显示天气
async function showWeather(weather, location) {
    const result = weather.result;
    const realtime = result.realtime;
    
    // 基础信息
    const temp = Math.round(realtime.temperature);
    const weatherDesc = getWeatherDesc(realtime.skycon);
    const humidity = Math.round(realtime.humidity * 100);
    const windSpeed = realtime.wind.speed.toFixed(1);
    const windDir = getWindDirection(realtime.wind.direction);
    
    // 日期
    const now = new Date();
    const dateStr = `${now.getMonth()+1}月${now.getDate()}日`;
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekDay = `周${weekDays[now.getDay()]}`;
    
    // 构建通知
    let title = `[彩云天气] ${dateStr} ${weekDay}`;
    if (location.city) {
        title = `[彩云天气] ${location.city} ${dateStr} ${weekDay}`;
    }
    
    let body = `🔱 ${result.forecast_keypoint || "暂无预报要点"}\n\n`;
    
    // 温度范围
    if (result.daily?.temperature?.[0]) {
        const today = result.daily.temperature[0];
        const maxTemp = Math.round(today.max);
        const minTemp = Math.round(today.min);
        body += `🌡 ${minTemp}°C ~ ${maxTemp}°C\n`;
    }
    
    body += `🌡 当前温度: ${temp}°C\n`;
    body += `💧 湿度: ${humidity}%\n`;
    body += `💨 风速: ${windSpeed}m/s (${windDir})\n`;
    
    if (realtime.life_index?.ultraviolet) {
        body += `☀️ 紫外线: ${realtime.life_index.ultraviolet.desc}\n`;
    }
    
    // 空气质量
    if (realtime.air_quality?.aqi) {
        const aqi = Math.round(realtime.air_quality.aqi);
        const aqiDesc = getAQIDesc(aqi);
        body += `🌫️ 空气质量: ${aqiDesc} (AQI ${aqi})\n`;
    }
    
    // 位置来源
    if (location.source) {
        body += `\n📍 位置来源: ${location.source}`;
        if (location.city) {
            body += ` (${location.city})`;
        }
    }
    
    console.log("📱 发送天气通知");
    
    $.notify(
        title,
        `${weatherDesc} ${temp}°C`,
        body.trim(),
        {
            "media-url": getWeatherIcon(realtime.skycon)
        }
    );
    
    console.log("✅ 天气通知发送完成");
}

// 工具函数
function getWeatherDesc(skycon) {
    const map = {
        "CLEAR_DAY": "☀️ 晴", "CLEAR_NIGHT": "🌙 晴夜",
        "PARTLY_CLOUDY_DAY": "⛅️ 多云", "PARTLY_CLOUDY_NIGHT": "☁️ 多云夜",
        "CLOUDY": "☁️ 阴", "LIGHT_RAIN": "🌦 小雨",
        "MODERATE_RAIN": "🌧 中雨", "HEAVY_RAIN": "💦 大雨",
        "STORM_RAIN": "⛈ 暴雨", "LIGHT_SNOW": "❄️ 小雪",
        "MODERATE_SNOW": "☃️ 中雪", "HEAVY_SNOW": "❄️ 大雪",
        "FOG": "🌫️ 雾"
    };
    return map[skycon] || "🌤 未知";
}

function getWeatherIcon(skycon) {
    const icons = {
        "CLEAR_DAY": "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLEAR_DAY.gif",
        "CLEAR_NIGHT": "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLEAR_NIGHT.gif",
        "PARTLY_CLOUDY_DAY": "https://raw.githubusercontent.com/58xinian/icon/master/Weather/PARTLY_CLOUDY_DAY.gif",
        "PARTLY_CLOUDY_NIGHT": "https://raw.githubusercontent.com/58xinian/icon/master/Weather/PARTLY_CLOUDY_NIGHT.gif",
        "CLOUDY": "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLOUDY.gif",
        "LIGHT_RAIN": "https://raw.githubusercontent.com/58xinian/icon/master/Weather/LIGHT_RAIN.gif",
        "MODERATE_RAIN": "https://raw.githubusercontent.com/58xinian/icon/master/Weather/MODERATE_RAIN.gif",
        "HEAVY_RAIN": "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HEAVY_RAIN.gif",
        "STORM_RAIN": "https://raw.githubusercontent.com/58xinian/icon/master/Weather/STORM_RAIN.gif",
        "LIGHT_SNOW": "https://raw.githubusercontent.com/58xinian/icon/master/Weather/LIGHT_SNOW.gif",
        "MODERATE_SNOW": "https://raw.githubusercontent.com/58xinian/icon/master/Weather/MODERATE_SNOW.gif",
        "HEAVY_SNOW": "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HEAVY_SNOW.gif",
        "FOG": "https://raw.githubusercontent.com/58xinian/icon/master/Weather/FOG.gif"
    };
    return icons[skycon] || icons["CLOUDY"];
}

function getWindDirection(angle) {
    const directions = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
    const index = Math.round(((angle % 360) / 45)) % 8;
    return directions[index];
}

function getAQIDesc(aqi) {
    if (aqi <= 50) return "优";
    if (aqi <= 100) return "良";
    if (aqi <= 150) return "轻度污染";
    if (aqi <= 200) return "中度污染";
    if (aqi <= 300) return "重度污染";
    return "严重污染";
}
