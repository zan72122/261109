/* Game Factory local play logger. No network or UI. */
(function () {
  'use strict';
  try {
    var key = 'gfpl1', match = location.pathname.match(/\/games\/([^/]+)\//);
    var id = match ? match[1] : document.title, now = Date.now;
    var last = now(), visible = document.visibilityState === 'visible';
    var seconds = 0, taps = 0, opening = true;
    function flush() {
      try {
        var at = now(), gap = Math.max(0, Math.min(10000, at - last));
        last = at;
        if (visible) seconds += gap / 1000;
        var data = JSON.parse(localStorage.getItem(key) || '{"g":{}}');
        if (!data || !data.g || typeof data.g !== 'object' || Array.isArray(data.g)) data = {g:{}};
        var g = data.g, own = Object.prototype.hasOwnProperty;
        var row = own.call(g, id) ? g[id] : null, epoch = Math.floor(at / 1000);
        if (!row || typeof row !== 'object') row = {o:epoch,l:epoch,n:0,s:0,t:0};
        row.s = (Number(row.s) || 0) + Math.floor(seconds);
        row.t = (Number(row.t) || 0) + taps;
        if (opening) { row.n = (Number(row.n) || 0) + 1; row.l = epoch; }
        Object.defineProperty(g, id, {value:row,enumerable:true,writable:true,configurable:true});
        var ids = Object.keys(g).sort(function (a, b) { return (g[b].l || 0) - (g[a].l || 0); });
        for (var i = 400; i < ids.length; i++) delete g[ids[i]];
        localStorage.setItem(key, JSON.stringify({g:g}));
        seconds -= Math.floor(seconds); taps = 0; opening = false;
      } catch (ignore) {}
    }
    function change() {
      try { flush(); visible = document.visibilityState === 'visible'; last = now(); } catch (ignore) {}
    }
    function tap() { try { taps++; } catch (ignore) {} }
    var opts = {capture:true,passive:true};
    if (window.PointerEvent) window.addEventListener('pointerdown', tap, opts);
    else {
      var touched = 0;
      window.addEventListener('touchstart', function () { try { touched = now(); tap(); } catch (ignore) {} }, opts);
      window.addEventListener('mousedown', function () { try { if (now() - touched > 800) tap(); } catch (ignore) {} }, opts);
    }
    document.addEventListener('visibilitychange', change, false);
    window.addEventListener('pagehide', function () { try { flush(); visible = false; } catch (ignore) {} }, false);
    window.addEventListener('pageshow', change, false);
    setInterval(flush, 5000);
    flush();
  } catch (ignore) {}
}());
