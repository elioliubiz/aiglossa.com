/* Shared tools payment flow. It owns checkout-tab lifetime and balance polling,
   but deliberately knows nothing about a tool's buttons or layout. */
(function (root) {
  "use strict";
  root.AiglossaWallet = {
    purchase: function (options) {
      var tab = window.open("about:blank", "aiglossa_checkout");
      if (!tab) {
        if (options.onError) options.onError("popup_blocked");
        return;
      }
      options.call(options.checkoutPath || "/ai/music/checkout", {
        credits: options.credits,
        success_url: options.successUrl
      }, true).then(function (data) {
        if (data.code !== 200 || !data.data || !data.data.checkout_url) {
          try { tab.close(); } catch (e) {}
          if (options.onError) options.onError(data.msg || "checkout_failed");
          return;
        }
        tab.location = data.data.checkout_url;
        if (options.onWaiting) options.onWaiting();
        var initial = options.getBalance();
        var tries = 0;
        var timer = setInterval(function () {
          tries += 1;
          options.refresh().then(function (ok) {
            if (!ok || options.getBalance() <= initial) return;
            clearInterval(timer);
            try { tab.close(); } catch (e) {}
            if (options.onCompleted) options.onCompleted(options.getBalance());
          });
          if (tries >= (options.maxPolls || 40)) {
            clearInterval(timer);
            if (options.onTimeout) options.onTimeout();
          }
        }, options.interval || 3000);
      }).catch(function () {
        try { tab.close(); } catch (e) {}
        if (options.onError) options.onError("checkout_failed");
      });
    }
  };
})(window);
