/**
彩云天气 v0.4
@author: Peng-YM (由助手修复和增强)
更新地址：https://raw.githubusercontent.com/Peng-YM/QuanX/master/Tasks/caiyun.js
 *
功能：
√ 自动定位
√ 异常天气预警
√ 实时天气预报
√ 3小时内天气预报
√ 农历日期显示
√ 公历日期星期显示
√ 下雨概率显示

TODO:
- 每日睡前预报

配置：
1️⃣ 配置自动定位
根据平台添加如下配置
(1). Quantumult X
[MITM]
hostname=weather-data.apple.com, api.weather.com
[rewrite_local]
https:\/\/((weather-data\.apple)|(api.weather))\.com url script-request-header https://raw.githubusercontent.com/Peng-YM/QuanX/master/Tasks/caiyun.js

(2). Loon
[MITM]
hostname=weather-data.apple.com, api.weather.com
[Script]
http-request https:\/\/((weather-data\.apple)|(api.weather))\.com script-path=https://raw.githubusercontent.com/Peng-YM/QuanX/master/Tasks/caiyun.js, require-body=false

(3). Surge
[MITM]
hostname=weather-data.apple.com, api.weather.com
[Script]
type=http-request, pattern=https:\/\/((weather-data\.apple)|(api.weather))\.com, script-path=https://raw.githubusercontent.com/Peng-YM/QuanX/master/Tasks/caiyun.js, require-body=false
2️⃣ 打开手机设置 > 隐私 > 定位服务
(1) 打开定位服务
(2) 选择天气，设置永远允许天气访问位置信息，并允许使用精确位置。
此时，打开系统天气应用，会提示获取位置成功，如果没有提示，请确认1️⃣是否配置正确。
3️⃣ 配置cron任务如：10 8-22/2 * * *
4️⃣ 打开box.js设置彩云令牌(不是链接！！！）即可。
*/

/********************** SCRIPT START *********************************/
const $ = API("caiyun");
const ERR = MYERR();

let display_location = $.read("display_location");
if (display_location === undefined) {
  display_location = false;
} else {
  display_location = JSON.parse(display_location);
}

if (typeof $request !== "undefined") {
  // get location from request url
  const url = $request.url;
  const res =
    url.match(/weather\/.*?\/(.*)\/(.*)\?/) ||
    url.match(/geocode\/([0-9.]*)\/([0-9.]*)\//) ||
    url.match(/geocode=([0-9.]*),([0-9.]*)/) ||
    url.match(/v2\/availability\/([0-9.]*)\/([0-9.]*)\//);
  if (res === null) {
    $.info(`❌ 正则表达式匹配错误，🥬 无法从URL: ${url} 获取位置。`);
    $.done({ body: $request.body });
  }
  const location = {
    latitude: res[1],
    longitude: res[2],
  };
  if (!$.read("location")) {
    $.notify("[彩云天气]", "", "🎉🎉🎉 获取定位成功。");
  }
  if (display_location) {
    $.info(
      `成功获取当前位置：纬度 ${location.latitude} 经度 ${location.longitude}`
    );
  }

  $.write(res[1], "#latitude");
  $.write(res[2], "#longitude");

  $.write(location, "location");
  $.done({ body: $request.body });
} else {
  // this is a task
  !(async () => {
    const token = $.read("token");
    if (!token) {
      throw new ERR.TokenError("❌ 未找到Token配置");
    }
    
    const { caiyun, tencent } = token;
    
    if (!caiyun) {
      throw new ERR.TokenError("❌ 未找到彩云Token令牌");
    } else if (caiyun.indexOf("http") !== -1) {
      throw new ERR.TokenError("❌ Token令牌 并不是 一个链接！");
    } else if (!tencent) {
      // 腾讯地图Token不是必须的，如果没有可以跳过地址获取
      $.log("⚠️ 未找到腾讯地图Token令牌，将使用默认地址显示");
    } else if (!$.read("location")) {
      // no location
      $.notify(
        "[彩云天气]",
        "❌ 未找到定位",
        "🤖 您可能没有正确设置MITM，请检查重写是否成功。"
      );
    } else {
      await scheduler();
    }
  })()
    .catch((err) => {
      if (err instanceof ERR.TokenError)
        $.notify(
          "[彩云天气]",
          err.message,
          "🤖 由于API Token具有时效性，请前往\nhttps://t.me/cool_scripts\n获取最新Token。",
          {
            "open-url": "https://t.me/cool_scripts",
          }
        );
      else {
        $.notify("[彩云天气]", "❌ 出现错误", err.message || JSON.stringify(err));
        $.error(err);
      }
    })
    .finally(() => $.done());
}

async function scheduler() {
  const now = new Date();
  $.log(
    `Scheduler activated at ${now.getMonth() + 1
    }月${now.getDate()}日${now.getHours()}时${now.getMinutes()}分`
  );
  await query();
  weatherAlert();
  realtimeWeather();
}

async function query() {
  const location = $.read("location") || {};
  $.log(`位置信息: ${JSON.stringify(location)}`);
  
  const isNumeric = (input) => input && !isNaN(input);
  if (!isNumeric(location.latitude) || !isNumeric(location.longitude)) {
    throw new Error("❌ 经纬度设置错误！");
  }

  if (Number(location.latitude) > 90 || Number(location.longitude) > 180) {
    throw new Error(
      "🤖 地理小课堂：经度的范围是0~180，纬度是0~90哦。请仔细检查经纬度是否设置正确。"
    );
  }
  
  // query API
  const token = $.read("token");
  const url = `https://api.caiyunapp.com/v2.5/${token.caiyun}/${location.longitude},${location.latitude}/weather?lang=zh_CN&dailystart=0&hourlysteps=384&dailysteps=16&alert=true`;

  $.log("Query weather from Caiyun API...");

  const weather = await $.http.get({
    url,
    headers: {
      "User-Agent": "ColorfulCloudsPro/5.0.10 (iPhone; iOS 14.0; Scale/3.00)",
    },
  })
    .then((resp) => {
      const body = JSON.parse(resp.body);
      if (body.status === "failed") {
        throw new Error(`彩云API错误: ${body.error}`);
      }
      return body;
    })
    .catch((err) => {
      $.error(`查询天气失败: ${err.message}`);
      throw err;
    });
  $.weather = weather;
  $.log(`获取天气数据成功，状态: ${weather.status}`);

  const now = new Date().getTime();
  const addressUpdated = $.read("address_updated");
  let address = $.read("address");
  
  // 如果有腾讯地图Token且地址需要更新，则获取地址
  const tencentToken = token.tencent;
  if (tencentToken && (addressUpdated === undefined || now - addressUpdated > 30 * 60 * 1000)) {
    await $.wait(Math.random() * 2000);
    $.log("Query location from Tencent Map...");
    
    try {
      const resp = await $.http.get(
        `https://apis.map.qq.com/ws/geocoder/v1/?key=${tencentToken}&location=${location.latitude},${location.longitude}`
      );
      
      const body = JSON.parse(resp.body);
      if (body.status === 0) {
        // 腾讯地图API返回格式处理
        const result = body.result;
        address = {
          province: result.address_component?.province || "",
          city: result.address_component?.city || "",
          district: result.address_component?.district || "",
          street: result.address_component?.street || "",
          address: result.address || ""
        };
        $.write(address, "address");
        $.write(now, "address_updated");
        $.log(`获取地址成功: ${result.address || "未知位置"}`);
      } else {
        $.error(`腾讯地图API错误: ${body.message}`);
        // 使用默认地址
        address = getDefaultAddress(location);
      }
    } catch (err) {
      $.error(`获取地址失败: ${err.message}`);
      // 使用默认地址
      address = getDefaultAddress(location);
    }
  } else if (!address) {
    // 如果没有地址信息，使用默认地址
    address = getDefaultAddress(location);
  }

  if (display_location == true) {
    $.info(`地址信息: ${JSON.stringify(address)}`);
  }
  $.address = address;
}

// 获取默认地址（使用彩云API返回的位置信息）
function getDefaultAddress(location) {
  return {
    province: "",
    city: "当前地区",
    district: "当前位置",
    street: "",
    address: `纬度: ${location.latitude}, 经度: ${location.longitude}`
  };
}

function weatherAlert() {
  try {
    const data = $.weather.result.alert;
    const address = $.address;
    const alerted = $.read("alerted") || [];

    if (data.status === "ok" && data.content && data.content.length > 0) {
      data.content.forEach((alert) => {
        if (alerted.indexOf(alert.alertId) === -1) {
          $.notify(
            `[彩云天气] ${address.city || ''} ${address.district || ''} ${address.street || ''}`,
            alert.title,
            alert.description
          );
          alerted.push(alert.alertId);
          if (alerted.length > 10) {
            alerted.shift();
          }
          $.write(alerted, "alerted");
        }
      });
    }
  } catch (err) {
    $.error(`天气预警处理失败: ${err.message}`);
  }
}

function realtimeWeather() {
  try {
    const data = $.weather.result;
    const address = $.address;
    const now = new Date();
    
    // 获取日期信息（公历年月日星期 + 农历）
    const dateInfo = getFullDateInfo(now);

    const alert = data.alert;
    const alertInfo = alert && alert.content && alert.content.length > 0
      ? alert.content.filter(curr => curr.status === "预警中")
                      .map(curr => mapAlertCode(curr.code) + "预警")
                      .join("\n") + "\n\n"
      : "";

    const realtime = data.realtime;
    const keypoint = data.forecast_keypoint;

    const hourly = data.hourly;
    const daily = data.daily;

    // 获取当天最高最低温度
    let tempRange = "";
    if (daily && daily.temperature && daily.temperature.length > 0) {
      const todayTemp = daily.temperature[0];
      if (todayTemp && todayTemp.max !== undefined && todayTemp.min !== undefined) {
        const maxTemp = Math.round(todayTemp.max);
        const minTemp = Math.round(todayTemp.min);
        tempRange = `🌡 ${minTemp}°C ~ ${maxTemp}°C\n`;
      }
    }

    // 生成未来3小时天气（包含下雨概率）
    let hourlyForecast = "[未来3小时天气]\n";
    
    for (let i = 0; i < 3; i++) {
      if (!hourly.skycon || !hourly.skycon[i]) break;
      
      const skycon = hourly.skycon[i];
      const dt = new Date(skycon.datetime);
      const startHour = dt.getHours();
      const endHour = (startHour + 1) % 24;
      
      // 获取温度
      let tempInfo = "";
      if (hourly.temperature && hourly.temperature[i]) {
        const temp = hourly.temperature[i].value;
        tempInfo = ` ${Math.round(temp)}°C`;
      }
      
      // 获取降水量
      let precipInfo = "";
      if (hourly.precipitation && hourly.precipitation[i]) {
        const precip = hourly.precipitation[i].value;
        if (precip > 0) {
          precipInfo = ` 💧${precip.toFixed(1)}mm`;
        }
      }
      
      // 获取下雨概率 - 彩云APIv2.5中下雨概率在hourly.precipitation[i].probability
      let probabilityInfo = "";
      
      // 方法1：直接获取probability
      if (hourly.precipitation && hourly.precipitation[i] && 
          hourly.precipitation[i].probability !== undefined) {
        const probability = hourly.precipitation[i].probability;
        if (probability !== undefined) {
          const probPercent = Math.round(probability * 100);
          probabilityInfo = ` ⛈${probPercent}%`;
        }
      }
      
      // 方法2：如果有独立的probability字段（老版本API）
      if (!probabilityInfo && hourly.probability && hourly.probability[i]) {
        const probability = hourly.probability[i].value;
        if (probability !== undefined) {
          const probPercent = Math.round(probability * 100);
          probabilityInfo = ` ⛈${probPercent}%`;
        }
      }
      
      hourlyForecast += 
        `${startHour.toString().padStart(2, '0')}:00-${endHour.toString().padStart(2, '0')}:00 ` +
        `${mapSkycon(skycon.value)[0]}${tempInfo}${precipInfo}${probabilityInfo}` +
        (i < 2 ? "\n" : "");
    }

    // 获取空气质量信息 - 修复NaN问题
    let airQuality = "";
    if (realtime.air_quality && realtime.air_quality.aqi && !isNaN(realtime.air_quality.aqi)) {
      const aqi = Math.round(realtime.air_quality.aqi);
      airQuality = `  🌤 AQI: ${aqi}`;
    }

    const notificationBody = `🔱 ${keypoint || "暂无预报要点"}

${tempRange}🌡 体感${realtime.life_index.comfort.desc} ${Math.round(realtime.apparent_temperature)}°C${airQuality}
💧 湿度 ${Math.round(realtime.humidity * 100)}%
🌞 紫外线 ${realtime.life_index.ultraviolet.desc}
💨 ${mapWind(realtime.wind.speed, realtime.wind.direction)}

${alertInfo}${hourlyForecast}`;

    $.notify(
      `[彩云天气] ${address.city || ''} ${address.district || ''}`,
      `${dateInfo}\n${mapSkycon(realtime.skycon)[0]} ${Math.round(realtime.temperature)}°C`,
      notificationBody,
      {
        "media-url": `${mapSkycon(realtime.skycon)[1]}`,
      }
    );
  } catch (err) {
    $.error(`实时天气处理失败: ${err.message}`);
    throw err;
  }
}

// 获取完整的日期信息（公历年月日星期 + 农历）
function getFullDateInfo(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // 星期映射
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekDay = weekDays[date.getDay()];
  
  // 获取农历日期
  const lunarDate = getLunarDate(date);
  
  // 返回完整日期信息
  return `${year}年${month}月${day}日 ${weekDay} ${lunarDate}`;
}

// 获取农历日期函数（使用原版正确的农历函数）
function getLunarDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // 农历数据表（1900-2099）
  const lunarInfo = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
    0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
    0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06aa0, 0x1a6c4, 0x0aae0,
    0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
    0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
    0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
    0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
    0x0d520, 0x0daa0, 0x15aa4, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, 0x0d520
  ];
  
  // 特殊节日
  const lunarFestivals = {
    "1-1": "春节",
    "1-15": "元宵",
    "5-5": "端午",
    "7-7": "七夕",
    "8-15": "中秋",
    "9-9": "重阳",
    "12-8": "腊八",
    "12-30": "除夕"
  };
  
  // 检查节日
  const festivalKey = `${month}-${day}`;
  if (lunarFestivals[festivalKey]) {
    return lunarFestivals[festivalKey];
  }
  
  // 农历月名称
  const monthNames = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];
  
  // 农历日名称
  const dayNames = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十", 
                   "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
                   "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];
  
  // 节气表（2024年）
  const solarTerms = {
    "1-6": "小寒",
    "1-20": "大寒",
    "2-4": "立春",
    "2-19": "雨水",
    "3-5": "惊蛰",
    "3-20": "春分",
    "4-5": "清明",
    "4-20": "谷雨",
    "5-5": "立夏",
    "5-21": "小满",
    "6-5": "芒种",
    "6-21": "夏至",
    "7-7": "小暑",
    "7-23": "大暑",
    "8-7": "立秋",
    "8-23": "处暑",
    "9-7": "白露",
    "9-23": "秋分",
    "10-8": "寒露",
    "10-23": "霜降",
    "11-7": "立冬",
    "11-22": "小雪",
    "12-7": "大雪",
    "12-21": "冬至"
  };
  
  // 检查节气
  if (solarTerms[festivalKey]) {
    return solarTerms[festivalKey];
  }
  
  // 计算农历
  try {
    // 计算农历
    let i, leap = 0, temp = 0;
    const baseDate = new Date(1900, 0, 31);
    let offset = Math.floor((date - baseDate) / 86400000);
    
    for (i = 1900; i < 2100 && offset > 0; i++) {
      temp = lunarYearDays(i);
      offset -= temp;
    }
    
    if (offset < 0) {
      offset += temp;
      i--;
    }
    
    const lunarYear = i;
    leap = leapMonth(i);
    let isLeap = false;
    
    for (i = 1; i < 13 && offset > 0; i++) {
      if (leap > 0 && i === (leap + 1) && !isLeap) {
        --i;
        isLeap = true;
        temp = leapDays(lunarYear);
      } else {
        temp = monthDays(lunarYear, i);
      }
      
      if (isLeap && i === (leap + 1)) isLeap = false;
      
      offset -= temp;
    }
    
    if (offset === 0 && leap > 0 && i === leap + 1) {
      if (isLeap) {
        isLeap = false;
      } else {
        isLeap = true;
        --i;
      }
    }
    
    if (offset < 0) {
      offset += temp;
      --i;
    }
    
    const lunarMonth = i;
    const lunarDay = offset + 1;
    
    // 构建农历日期字符串
    let lunarDateStr = "";
    
    if (isLeap) {
      lunarDateStr = "闰" + monthNames[lunarMonth - 1];
    } else {
      lunarDateStr = monthNames[lunarMonth - 1];
    }
    
    lunarDateStr += dayNames[lunarDay - 1];
    
    return "农历" + lunarDateStr;
  } catch (error) {
    // 如果计算失败，返回简单日期
    return `${month}月${day}日`;
  }
  
  // 辅助函数
  function lunarYearDays(year) {
    let sum = 348;
    for (let i = 0x8000; i > 0x8; i >>= 1) {
      sum += (lunarInfo[year - 1900] & i) ? 1 : 0;
    }
    return sum + leapDays(year);
  }
  
  function leapDays(year) {
    if (leapMonth(year)) {
      return ((lunarInfo[year - 1900] & 0x10000) ? 30 : 29);
    }
    return 0;
  }
  
  function leapMonth(year) {
    return lunarInfo[year - 1900] & 0xf;
  }
  
  function monthDays(year, month) {
    return (lunarInfo[year - 1900] & (0x10000 >> month)) ? 30 : 29;
  }
}

/************************** 天气对照表 *********************************/

function mapAlertCode(code) {
  const names = {
    "01": "🌪 台风",
    "02": "⛈ 暴雨",
    "03": "❄️ 暴雪",
    "04": "❄ 寒潮",
    "05": "💨 大风",
    "06": "💨 沙尘暴",
    "07": "☄️ 高温",
    "08": "☄️ 干旱",
    "09": "⚡️ 雷电",
    "10": "💥 冰雹",
    "11": "❄️ 霜冻",
    "12": "💨 大雾",
    "13": "💨 霾",
    "14": "❄️ 道路结冰",
    "15": "🔥 森林火灾",
    "16": "⛈ 雷雨大风",
  };

  const intensity = {
    "01": "蓝色",
    "02": "黄色",
    "03": "橙色",
    "04": "红色",
  };

  const res = code.match(/(\d{2})(\d{2})/);
  if (!res) return "未知预警";
  return `${names[res[1]] || "未知"}${intensity[res[2]] || ""}`;
}

function mapWind(speed, direction) {
  let description = "";
  let d_description = "";

  if (speed < 1) {
    description = "无风";
    return description;
  } else if (speed <= 5) {
    description = "1级 微风徐徐";
  } else if (speed <= 11) {
    description = "2级 清风";
  } else if (speed <= 19) {
    description = "3级 树叶摇摆";
  } else if (speed <= 28) {
    description = "4级 树枝摇动";
  } else if (speed <= 38) {
    description = "5级 风力强劲";
  } else if (speed <= 49) {
    description = "6级 风力强劲";
  } else if (speed <= 61) {
    description = "7级 风力超强";
  } else if (speed <= 74) {
    description = "8级 狂风大作";
  } else if (speed <= 88) {
    description = "9级 狂风呼啸";
  } else if (speed <= 102) {
    description = "10级 暴风毁树";
  } else if (speed <= 117) {
    description = "11级 暴风毁树";
  } else if (speed <= 133) {
    description = "12级 飓风";
  } else if (speed <= 149) {
    description = "13级 台风";
  } else if (speed <= 166) {
    description = "14级 强台风";
  } else if (speed <= 183) {
    description = "15级 强台风";
  } else if (speed <= 201) {
    description = "16级 超强台风";
  } else if (speed <= 220) {
    description = "17级 超强台风";
  } else {
    description = "超强台风";
  }

  if (direction >= 348.76 || direction <= 11.25) {
    d_description = "北";
  } else if (direction >= 11.26 && direction <= 33.75) {
    d_description = "北东北";
  } else if (direction >= 33.76 && direction <= 56.25) {
    d_description = "东北";
  } else if (direction >= 56.26 && direction <= 78.75) {
    d_description = "东东北";
  } else if (direction >= 78.76 && direction <= 101.25) {
    d_description = "东";
  } else if (direction >= 101.26 && direction <= 123.75) {
    d_description = "东东南";
  } else if (direction >= 123.76 && direction <= 146.25) {
    d_description = "东南";
  } else if (direction >= 146.26 && direction <= 168.75) {
    d_description = "南东南";
  } else if (direction >= 168.76 && direction <= 191.25) {
    d_description = "南";
  } else if (direction >= 191.26 && direction <= 213.75) {
    d_description = "南西南";
  } else if (direction >= 213.76 && direction <= 236.25) {
    d_description = "西南";
  } else if (direction >= 236.26 && direction <= 258.75) {
    d_description = "西西南";
  } else if (direction >= 258.76 && direction <= 281.25) {
    d_description = "西";
  } else if (direction >= 281.26 && direction <= 303.75) {
    d_description = "西西北";
  } else if (direction >= 303.76 && direction <= 326.25) {
    d_description = "西北";
  } else if (direction >= 326.26 && direction <= 348.75) {
    d_description = "北西北";
  } else {
    d_description = "未知方向";
  }

  return `${d_description}风 ${description} (${speed.toFixed(1)}m/s)`;
}

function mapSkycon(skycon) {
  const map = {
    CLEAR_DAY: [
      "☀️ 日间晴朗",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLEAR_DAY.gif",
    ],
    CLEAR_NIGHT: [
      "✨ 夜间晴朗",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLEAR_NIGHT.gif",
    ],
    PARTLY_CLOUDY_DAY: [
      "⛅️ 日间多云",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/PARTLY_CLOUDY_DAY.gif",
    ],
    PARTLY_CLOUDY_NIGHT: [
      "☁️ 夜间多云",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/PARTLY_CLOUDY_NIGHT.gif",
    ],
    CLOUDY: [
      "☁️ 阴",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLOUDY.gif",
    ],
    LIGHT_HAZE: [
      "😤 轻度雾霾",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HAZE.gif",
    ],
    MODERATE_HAZE: [
      "😤 中度雾霾",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HAZE.gif",
    ],
    HEAVY_HAZE: [
      "😤 重度雾霾",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HAZE.gif",
    ],
    LIGHT_RAIN: [
      "💧 小雨",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/LIGHT_RAIN.gif",
    ],
    MODERATE_RAIN: [
      "💦 中雨",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/MODERATE_RAIN.gif",
    ],
    HEAVY_RAIN: [
      "🌧 大雨",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HEAVY_RAIN.gif",
    ],
    STORM_RAIN: [
      "⛈ 暴雨",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/STORM_RAIN.gif",
    ],
    LIGHT_SNOW: [
      "🌨 小雪",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/LIGHT_SNOW.gif",
    ],
    MODERATE_SNOW: [
      "❄️ 中雪",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/MODERATE_SNOW.gif",
    ],
    HEAVY_SNOW: [
      "☃️ 大雪",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HEAVY_SNOW.gif",
    ],
    STORM_SNOW: [
      "⛄️ 暴雪",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HEAVY_SNOW.gif",
    ],
    FOG: [
      "🌫️ 雾",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/FOG.gif",
    ],
    LIGHT_WIND: [
      "💨 微风",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/WIND.gif",
    ],
    STRONG_WIND: [
      "🌪 大风",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/WIND.gif",
    ],
    DUST: [
      "💨 浮尘",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HAZE.gif",
    ],
    SAND: [
      "💨 沙尘",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/HAZE.gif",
    ],
    WIND: [
      "💨 有风",
      "https://raw.githubusercontent.com/58xinian/icon/master/Weather/WIND.gif",
    ],
  };
  
  return map[skycon] || ["🌤 未知天气", "https://raw.githubusercontent.com/58xinian/icon/master/Weather/CLOUDY.gif"];
}

/************************** ERROR *********************************/
function MYERR() {
  class TokenError extends Error {
    constructor(message) {
      super(message);
      this.name = "TokenError";
    }
  }

  return {
    TokenError,
  };
}

// prettier-ignore
/*********************************** API *************************************/
function ENV() { const e = "undefined" != typeof $task, t = "undefined" != typeof $loon, s = "undefined" != typeof $httpClient && !t, i = "function" == typeof require && "undefined" != typeof $jsbox; return { isQX: e, isLoon: t, isSurge: s, isNode: "function" == typeof require && !i, isJSBox: i, isRequest: "undefined" != typeof $request, isScriptable: "undefined" != typeof importModule } } function HTTP(e = { baseURL: "" }) { const { isQX: t, isLoon: s, isSurge: i, isScriptable: n, isNode: o } = ENV(), r = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*)/; const u = {}; return ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"].forEach(l => u[l.toLowerCase()] = (u => (function (u, l) { l = "string" == typeof l ? { url: l } : l; const h = e.baseURL; h && !r.test(l.url || "") && (l.url = h ? h + l.url : l.url); const a = (l = { ...e, ...l }).timeout, c = { onRequest: () => { }, onResponse: e => e, onTimeout: () => { }, ...l.events }; let f, d; if (c.onRequest(u, l), t) f = $task.fetch({ method: u, ...l }); else if (s || i || o) f = new Promise((e, t) => { (o ? require("request") : $httpClient)[u.toLowerCase()](l, (s, i, n) => { s ? t(s) : e({ statusCode: i.status || i.statusCode, headers: i.headers, body: n }) }) }); else if (n) { const e = new Request(l.url); e.method = u, e.headers = l.headers, e.body = l.body, f = new Promise((t, s) => { e.loadString().then(s => { t({ statusCode: e.response.statusCode, headers: e.response.headers, body: s }) }).catch(e => s(e)) }) } const p = a ? new Promise((e, t) => { d = setTimeout(() => (c.onTimeout(), t(`${u} URL: ${l.url} exceeds the timeout ${a} ms`)), a) }) : null; return (p ? Promise.race([p, f]).then(e => (clearTimeout(d), e)) : f).then(e => c.onResponse(e)) })(l, u))), u } function API(e = "untitled", t = !1) { const { isQX: s, isLoon: i, isSurge: n, isNode: o, isJSBox: r, isScriptable: u } = ENV(); return new class { constructor(e, t) { this.name = e, this.debug = t, this.http = HTTP(), this.env = ENV(), this.node = (() => { if (o) { return { fs: require("fs") } } return null })(), this.initCache(); Promise.prototype.delay = function (e) { return this.then(function (t) { return ((e, t) => new Promise(function (s) { setTimeout(s.bind(null, t), e) }))(e, t) }) } } initCache() { if (s && (this.cache = JSON.parse($prefs.valueForKey(this.name) || "{}")), (i || n) && (this.cache = JSON.parse($persistentStore.read(this.name) || "{}")), o) { let e = "root.json"; this.node.fs.existsSync(e) || this.node.fs.writeFileSync(e, JSON.stringify({}), { flag: "wx" }, e => console.log(e)), this.root = {}, e = `${this.name}.json`, this.node.fs.existsSync(e) ? this.cache = JSON.parse(this.node.fs.readFileSync(`${this.name}.json`)) : (this.node.fs.writeFileSync(e, JSON.stringify({}), { flag: "wx" }, e => console.log(e)), this.cache = {}) } } persistCache() { const e = JSON.stringify(this.cache, null, 2); s && $prefs.setValueForKey(e, this.name), (i || n) && $persistentStore.write(e, this.name), o && (this.node.fs.writeFileSync(`${this.name}.json`, e, { flag: "w" }, e => console.log(e)), this.node.fs.writeFileSync("root.json", JSON.stringify(this.root, null, 2), { flag: "w" }, e => console.log(e))) } write(e, t) { if (this.log(`SET ${t}`), -1 !== t.indexOf("#")) { if (t = t.substr(1), n || i) return $persistentStore.write(e, t); if (s) return $prefs.setValueForKey(e, t); o && (this.root[t] = e) } else this.cache[t] = e; this.persistCache() } read(e) { return this.log(`READ ${e}`), -1 === e.indexOf("#") ? this.cache[e] : (e = e.substr(1), n || i ? $persistentStore.read(e) : s ? $prefs.valueForKey(e) : o ? this.root[e] : void 0) } delete(e) { if (this.log(`DELETE ${e}`), -1 !== e.indexOf("#")) { if (e = e.substr(1), n || i) return $persistentStore.write(null, e); if (s) return $prefs.removeValueForKey(e); o && delete this.root[e] } else delete this.cache[e]; this.persistCache() } notify(e, t = "", l = "", h = {}) { const a = h["open-url"], c = h["media-url"]; if (s && $notify(e, t, l, h), n && $notification.post(e, t, l + `${c ? "\n多媒体:" + c : ""}`, { url: a }), i) { let s = {}; a && (s.openUrl = a), c && (s.mediaUrl = c), "{}" === JSON.stringify(s) ? $notification.post(e, t, l) : $notification.post(e, t, l, s) } if (o || u) { const s = l + (a ? `\n点击跳转: ${a}` : "") + (c ? `\n多媒体: ${c}` : ""); if (r) { require("push").schedule({ title: e, body: (t ? t + "\n" : "") + s }) } else console.log(`${e}\n${t}\n${s}\n\n`) } } log(e) { this.debug && console.log(`[${this.name}] LOG: ${this.stringify(e)}`) } info(e) { console.log(`[${this.name}] INFO: ${this.stringify(e)}`) } error(e) { console.log(`[${this.name}] ERROR: ${this.stringify(e)}`) } wait(e) { return new Promise(t => setTimeout(t, e)) } done(e = {}) { s || i || n ? $done(e) : o && !r && "undefined" != typeof $context && ($context.headers = e.headers, $context.statusCode = e.statusCode, $context.body = e.body) } stringify(e) { if ("string" == typeof e || e instanceof String) return e; try { return JSON.stringify(e, null, 2) } catch (e) { return "[object Object]" } } }(e, t) }
/*****************************************************************************/
