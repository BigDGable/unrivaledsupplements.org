(function () {
  "use strict";

  /* ---------- Mobile navigation ---------- */
  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".menu-toggle");

  function setMenu(open) {
    if (!header || !toggle) return;
    header.setAttribute("data-open", open ? "true" : "false");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  if (header && toggle) {
    toggle.addEventListener("click", function () {
      setMenu(header.getAttribute("data-open") !== "true");
    });
    header.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && header.getAttribute("data-open") === "true") {
        setMenu(false);
        toggle.focus();
      }
    });
    var wide = window.matchMedia("(min-width: 1101px)");
    var onWide = function (e) { if (e.matches) setMenu(false); };
    if (wide.addEventListener) wide.addEventListener("change", onWide);
    else if (wide.addListener) wide.addListener(onWide);
  }

  /* ---------- Contact form ---------- */
  var form = document.getElementById("inquiry-form");
  if (!form) return;

  var result = document.getElementById("inquiry-result");
  var output = document.getElementById("inquiry-text");
  var copyBtn = document.getElementById("copy-inquiry");
  var editBtn = document.getElementById("edit-inquiry");
  var status = document.getElementById("copy-status");
  var resultHeading = document.getElementById("result-heading");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var toLink = document.getElementById("inquiry-to");
  var DOMAIN = "@unrivaledsupplements.org";
  var ROUTES = {
    "New product development": "partners",
    "Formula transfer": "partners",
    "Research services": "partners",
    "Existing partner support": "partners",
    "Careers": "careers"
  };
  var recipient = "hello" + DOMAIN;

  function val(name) {
    var el = form.elements[name];
    return el && el.value ? el.value.trim() : "";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var lines = [
      "Name: " + val("name"),
      "Company: " + (val("company") || "Not provided"),
      "Email: " + val("email"),
      "Phone: " + (val("phone") || "Not provided"),
      "Inquiry type: " + val("topic"),
      "Product format: " + val("format"),
      "",
      val("message")
    ];
    output.value = lines.join("\n");
    recipient = (ROUTES[val("topic")] || "hello") + DOMAIN;
    if (toLink) {
      toLink.textContent = recipient;
      toLink.setAttribute("href", "mailto:" + recipient);
    }
    status.textContent = "";
    result.hidden = false;
    result.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    resultHeading.focus({ preventScroll: true });
  });

  function selectFallback() {
    output.focus();
    output.select();
    status.textContent = "The text is selected. Press Ctrl+C (or ⌘C on a Mac) to copy it.";
  }

  copyBtn.addEventListener("click", function () {
    var text = output.value;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          status.textContent = "Copied. Paste it into a new email to " + recipient + ".";
        }, selectFallback);
      } else {
        selectFallback();
      }
    } catch (err) {
      selectFallback();
    }
  });

  editBtn.addEventListener("click", function () {
    result.hidden = true;
    var first = form.elements["name"];
    if (first) first.focus();
  });
})();
