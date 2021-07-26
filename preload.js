const axios = require('axios')

let lastList = [];
let callback;
//2s定时刷新列表
// setInterval(() => {
//     if (lastList && lastList.length > 0 && callback) {
//         render(lastList, callback);
//     }
// }, 2000);
function render(list, callbackSetList, alert = []) {
    if (alert.length == 0) {
        lastList = list;
    }
    let renderList = list.filter(v => v.match(/[a-zA-Z]/)).join(',')
    axios.get('http://hq.sinajs.cn/list=' + renderList)
        .then(res => {
            const render = res.data.split('\n').filter(v => v && v.length > 0).map(line => {
                try {
                    const info = line.match(/var hq_str_(.*)="(.*)"/)
                    const code = info[1];
                    if (info[2] && info[2].length > 0) {
                        const params = info[2].split(',');
                        if (code.startsWith("gb_")) {
                            //美股格式不一样
                            return {
                                title: params[0] + "丨" + code,
                                description: `当前:\t${params[1]}丨涨跌:\t${params[2]} (${(parseFloat(params[2]) * 0.01 * parseFloat(params[26])).toFixed(2)}$)丨今开:\t${params[5]}丨昨收:\t${params[26]}丨市值:\t${params[12]}`,
                                icon: parseFloat(params[2]) >= 0 ? 'up.png' : 'down.png',
                                code
                            }
                        } else if (code.startsWith("hk")) {
                            //港格式不一样
                            return {
                                title: params[1] + "丨" + code,
                                description: `当前:\t${params[6]}丨涨跌:\t${params[8]} (${(parseFloat(params[8]) * 0.01 * parseFloat(params[3])).toFixed(2)}HK$)丨最高:\t${params[4]}丨最低:\t${params[5]}丨今开:\t${params[2]}丨昨收:\t${params[3]}`,
                                icon: parseFloat(params[8]) >= 0 ? 'up.png' : 'down.png',
                                code
                            }
                        } else {
                            const change = ((parseFloat(params[3]) - parseFloat(params[2])) / parseFloat(params[2]) * 100).toFixed(2);
                            return {
                                title: params[0] + "丨" + code,
                                description: `当前:\t${params[3]}丨涨跌:\t${change} (${(change * 0.01 * parseFloat(params[2])).toFixed(2)}¥)丨最高:\t${params[4]}丨最低:\t${params[5]}丨今开:\t${params[1]}丨昨收:\t${params[2]}`,
                                icon: change >= 0 ? 'up.png' : 'down.png',
                                code
                            }
                        }
                    }
                    return null
                } catch (error) {
                    return null
                }
            }).filter(v => v)
            callbackSetList([...alert, ...render])
        })
}
window.exports = {
    "stock.list": { // 注意：键对应的是 plugin.json 中的 features.code
        mode: "list",  // 列表模式
        args: {
            enter: (action, callbackSetList) => {
                callback = callbackSetList;
                callbackSetList([
                    {
                        title: '我的自选加载中...',
                    }
                ])
                const data = utools.db.get('attention.list');
                if (data && data.data && data.data.length > 0) {
                    const myList = data.data;
                    render(myList, callbackSetList);
                } else {
                    render(['sh000001', 'sh000300'], callbackSetList, [
                        {
                            title: '您未关注任何一只股票',
                            description: '默认为您关注大盘',
                            icon: 'waring.png'
                        }
                    ])
                }
                if (!data) {
                    utools.db.put({
                        _id: 'attention.list',
                        data: ['sh000001', 'sh000300']
                    })
                }
            },
            search: (action, searchWord, callbackSetList) => {
                if (searchWord.indexOf("丨") < 0) {
                    axios.get('http://suggest3.sinajs.cn/suggest/type=11,12,31,41&key=' + encodeURI(searchWord))
                        .then(res => {
                            const renderList = res.data.match(/var suggestvalue="(.*)"/)[1].split(';').filter(v => v).map(line => {
                                const params = line.split(',');
                                if (params[1] === '41') {
                                    return 'gb_' + params[3].replace('.', '$')
                                } else if (params[1] === '31') {
                                    return 'hk' + params[3]
                                }
                                return params[3]
                            }).filter(v => v)
                            render(renderList, callbackSetList);
                        })
                }
                if (searchWord == '') {
                    utools.redirect('股票');
                }
            },
            // 用户选择列表中某个条目时被调用
            select: (action, itemData, callbackSetList) => {
                const code = itemData.code
                const record = utools.db.get('attention.list');
                const data = record ? new Set(record.data) : new Set();
                const save = () => {
                    if (record) {
                        utools.db.put({
                            _id: 'attention.list',
                            data: Array.from(data),
                            _rev: record._rev
                        })
                    } else {
                        utools.db.put({
                            _id: 'attention.list',
                            data: Array.from(data)
                        })
                    }
                    utools.redirect('股票');
                }
                if (itemData.action) {
                    switch (itemData.action) {
                        case 'save':
                            data.add(code)
                            save()
                            break
                        case 'remove':
                            data.delete(code)
                            save()
                            break
                        case 'open':
                            window.utools.hideMainWindow()
                            if (code.startsWith("gb_")) {
                                //美股格式不一样
                                require('electron').shell.openExternal(`https://stock.finance.sina.com.cn/usstock/quotes/${code.replace('gb_', '').replace('$', '')}.html`)
                            } else if (code.startsWith("hk")) {
                                //港格式不一样
                                require('electron').shell.openExternal(`https://stock.finance.sina.com.cn/hkstock/quotes/${code.replace('hk', '')}.html`)
                            } else {
                                require('electron').shell.openExternal(`https://finance.sina.com.cn/realstock/company/${code}/nc.shtml`)
                            }
                            window.utools.outPlugin()
                            break
                    }
                } else {
                    lastList = [];
                    utools.setSubInputValue(itemData.title)
                    let renderList = []
                    if (data && data.has(code)) {
                        renderList.push({
                            title: '打开详情',
                            action: 'open',
                            code
                        })
                        renderList.push({
                            title: '移出自选',
                            action: 'remove',
                            code
                        })
                    } else {
                        renderList.push({
                            title: '加入自选',
                            action: 'save',
                            code
                        })
                        renderList.push({
                            title: '打开详情',
                            action: 'open',
                            code
                        })
                    }
                    callbackSetList(renderList)
                }
            },
            // 子输入框为空时的占位符，默认为字符串"搜索"
            placeholder: "搜索：股票名称/代码"
        }
    }
}