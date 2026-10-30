/* Shared system-share and clipboard fallback for tools pages.
   Link creation, messages and business state remain owned by each tool. */
(function (root) {
  "use strict";

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      input.style.pointerEvents = "none";
      document.body.appendChild(input);
      input.select();
      input.setSelectionRange(0, input.value.length);
      var copied = false;
      try { copied = document.execCommand("copy"); } catch (_) {}
      input.remove();
      if (copied) resolve(); else reject(new Error("copy failed"));
    });
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }

  function shareOrCopy(options) {
    var payload = {title: options.title || document.title, url: options.url};
    var systemShare = typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare(payload));
    if (systemShare) {
      return navigator.share(payload).catch(function (error) {
        if (error && error.name === "AbortError") return;
        return copy(options.url).then(options.onCopied, options.onError);
      });
    }
    return copy(options.url).then(options.onCopied, options.onError);
  }

  root.AiglossaShare = {copy: copy, shareOrCopy: shareOrCopy};
})(window);
