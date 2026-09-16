/* Scholan 官网的少量客户端行为。
   只做一件事：记住用户选过的语言。

   设计原则（有意为之）：**不按 Accept-Language / IP 猜语言、不自动跳转**。
   按语言自动跳会同时伤 SEO（爬虫只看到一种语言）和用户（VPN、系统语言与实际意愿不符），
   这里只认"用户自己点过"的选择：
     · 只有根路径（默认语言页）会跳——其他语言页是用户明确点进来的，不打断；
     · 爬虫没有 localStorage，因此永远看到默认语言页，索引不受影响；
     · 用户在切换器里选回默认语言时清掉记录，不会被弹回去。

   语言清单与当前语言由生成脚本写进 <html data-default-lang> 与链接的 data-lang。 */

(function () {
  var KEY = 'aiglossa.lang';
  var root = document.documentElement;
  var defaultLang = root.getAttribute('data-default-lang') || 'en';

  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(value) {
    try {
      if (value && value !== defaultLang) { localStorage.setItem(KEY, value); }
      else { localStorage.removeItem(KEY); }
    } catch (e) { /* 隐私模式等场景下静默降级：不记就不记 */ }
  }

  // 只在默认语言页做"送回已选语言"；且仅当路径就是根路径时。
  // file: 协议下直接跳过——本地双击预览时不该被跳走（也没有站点根可跳）。
  var path = location.pathname.replace(/index\.html$/, '');
  if (location.protocol !== 'file:' && (path === '/' || path === '')) {
    var saved = read();
    if (saved && saved !== defaultLang) {
      location.replace('/' + encodeURIComponent(saved) + '/');
      return;
    }
  }

  // 记录切换动作（含选回默认语言时清除记录）。
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[data-lang]') : null;
    if (link) { write(link.getAttribute('data-lang')); }
  });
})();
