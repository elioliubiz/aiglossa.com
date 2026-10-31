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
      options.call(options.checkoutPath || "/wallet/checkout", {
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
        var checkoutId = data.data.checkout_id;
        var tries = 0;
        var timer = setInterval(function () {
          tries += 1;
          var confirmed = options.call(options.statusPath || "/wallet/checkout/status", {checkout_id: checkoutId}, true)
            .then(function (status) { return status.code === 200 && status.data && status.data.status === "paid"; })
            .catch(function () { return false; });
          confirmed.then(function (paid) {
            if (!paid) return false;
            return options.refresh();
          }).then(function (ok) {
            if (!ok) return;
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
