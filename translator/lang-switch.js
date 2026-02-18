/**
 * Language Toggle — client-side script included in both English and Hebrew builds.
 * Adds a fixed button that switches between English and Hebrew versions of the page.
 *
 * English → Hebrew: /abilities.html → /he/abilities.html
 * Hebrew  → English: /he/abilities.html → /abilities.html
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'bfrpg-lang';

  function isHebrew() {
    return window.location.pathname.indexOf('/he/') !== -1;
  }

  function getTargetUrl() {
    var path = window.location.pathname;
    if (isHebrew()) {
      // Remove /he/ prefix to go to English
      return path.replace('/he/', '/');
    } else {
      // Insert /he/ before the filename
      var parts = path.split('/');
      parts.splice(-1, 0, 'he');
      return parts.join('/');
    }
  }

  function createButton() {
    var btn = document.createElement('button');
    btn.className = 'lang-toggle-btn';
    btn.title = isHebrew() ? 'Switch to English' : 'עברית';
    btn.textContent = isHebrew() ? 'EN' : 'עב';
    btn.setAttribute('aria-label', isHebrew() ? 'Switch to English' : 'החלף לעברית');

    btn.addEventListener('click', function () {
      var target = getTargetUrl();
      localStorage.setItem(STORAGE_KEY, isHebrew() ? 'en' : 'he');
      window.location.href = target;
    });

    return btn;
  }

  function init() {
    // Inject button styles if not already present
    if (!document.getElementById('lang-toggle-style')) {
      var style = document.createElement('style');
      style.id = 'lang-toggle-style';
      style.textContent = [
        '.lang-toggle-btn {',
        '  position: fixed;',
        '  top: 70px;',
        '  right: 20px;',
        '  z-index: 9999;',
        '  background: #2c7a7b;',
        '  color: #fff;',
        '  border: none;',
        '  border-radius: 4px;',
        '  padding: 6px 12px;',
        '  font-size: 14px;',
        '  font-weight: bold;',
        '  cursor: pointer;',
        '  box-shadow: 0 2px 6px rgba(0,0,0,0.2);',
        '  transition: background 0.2s;',
        '}',
        '.lang-toggle-btn:hover {',
        '  background: #285e61;',
        '}',
      ].join('\n');
      document.head.appendChild(style);
    }

    document.body.appendChild(createButton());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
