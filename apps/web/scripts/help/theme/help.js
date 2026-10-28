// The user guide's script (the page's policy allows nothing inline, so it's
// all here). Before the page paints: the editor's theme — the editor's own
// when the guide is open in its help panel, otherwise the one it saved, or
// the system's. Once the page is read: shortcuts as a Mac shows them, the
// contents rail marking the part being read, and the search box.
(function () {
  var root = document.documentElement;
  var THEME_KEY = 'quar-animator-ui-theme';
  root.classList.add('js');

  // Open in the editor's help panel (same origin), or a page of its own
  var parentRoot = null;
  try {
    if (window.parent !== window && window.parent.document) {
      parentRoot = window.parent.document.documentElement;
    }
  } catch (e) {
    parentRoot = null;
  }
  if (parentRoot) root.classList.add('framed');

  function pickTheme() {
    if (parentRoot) {
      var shown = parentRoot.getAttribute('data-theme');
      if (shown === 'light' || shown === 'dark') return shown;
    }
    var saved = null;
    try {
      saved = window.localStorage.getItem(THEME_KEY);
    } catch (e) {
      // Storage blocked: the system's theme
    }
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }

  function applyTheme() {
    root.setAttribute('data-theme', pickTheme());
  }

  applyTheme();
  window.addEventListener('storage', function (event) {
    if (event.key === THEME_KEY) applyTheme();
  });
  if (parentRoot && window.MutationObserver) {
    try {
      new MutationObserver(applyTheme).observe(parentRoot, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    } catch (e) {
      // The panel also sets the theme itself
    }
  } else if (window.matchMedia) {
    var system = window.matchMedia('(prefers-color-scheme: light)');
    if (system.addEventListener) system.addEventListener('change', applyTheme);
  }
})();

document.addEventListener('DOMContentLoaded', function () {
  var helpRoot = (document.querySelector('meta[name="help-root"]') || {}).content || '';
  var isMac = /Mac|iPhone|iPad|iPod/.test(
    (navigator.userAgentData && navigator.userAgentData.platform) ||
      navigator.platform ||
      navigator.userAgent
  );

  // ---- Shortcuts as this computer's keyboard has them ----
  if (isMac) {
    var macLabels = { mod: 'Cmd', alt: 'Option' };
    Array.prototype.forEach.call(document.querySelectorAll('kbd[data-key]'), function (key) {
      var label = macLabels[key.getAttribute('data-key')];
      if (label) key.textContent = label;
    });
  }

  // ---- Opened from files (the desktop app): folders don't open their index.html ----
  function pageHref(href) {
    if (window.location.protocol !== 'file:' || /^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
    return href.replace(/^([^#?]*\/)([?#].*)?$/, function (all, folder, rest) {
      return folder + 'index.html' + (rest || '');
    });
  }
  if (window.location.protocol === 'file:') {
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (link) {
      link.setAttribute('href', pageHref(link.getAttribute('href')));
    });
  }

  // ---- The contents rail: open beside the text, folded above it on narrow screens ----
  var details = document.querySelector('.index details');
  var wide = window.matchMedia('(min-width: 1041px)');
  var fold = function () {
    if (details) details.open = wide.matches;
  };
  fold();
  if (wide.addEventListener) wide.addEventListener('change', fold);

  var railLinks = Array.prototype.slice.call(document.querySelectorAll('.index a'));
  if ('IntersectionObserver' in window && railLinks.length > 0) {
    var byId = {};
    railLinks.forEach(function (link) {
      byId[decodeURIComponent(link.getAttribute('href').split('#')[1] || '')] = link;
    });
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var link = byId[entry.target.id];
          if (!link) return;
          railLinks.forEach(function (other) {
            other.removeAttribute('aria-current');
          });
          link.setAttribute('aria-current', 'location');
        });
      },
      { rootMargin: '0px 0px -70% 0px' }
    );
    Object.keys(byId).forEach(function (id) {
      var heading = document.getElementById(id);
      if (heading) observer.observe(heading);
    });
  }

  // ---- Search, across every chapter (the index is a script beside the pages) ----
  var input = document.getElementById('help-search');
  var box = document.getElementById('help-search-results');
  if (!input || !box) return;

  var status = document.createElement('p');
  status.className = 'visually-hidden';
  status.setAttribute('role', 'status');
  input.parentNode.appendChild(status);

  var requested = false;
  var results = [];
  var active = -1;

  function loadIndex() {
    if (window.QUAR_HELP_INDEX || requested) return;
    requested = true;
    var script = document.createElement('script');
    script.src = helpRoot + 'search-index.js';
    script.onload = function () {
      search();
    };
    script.onerror = function () {
      requested = false;
    };
    document.head.appendChild(script);
  }

  function foldText(text) {
    return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Every part of every chapter that has all the words, best first. */
  function find(query) {
    var terms = foldText(query)
      .split(/\s+/)
      .filter(function (term) {
        return term.length > 0;
      });
    if (terms.length === 0) return [];
    var found = [];
    (window.QUAR_HELP_INDEX || []).forEach(function (chapter) {
      var chapterTitle = foldText(chapter.title);
      chapter.sections.forEach(function (section) {
        var title = foldText(section.title);
        var text = foldText(section.text);
        var score = 0;
        for (var i = 0; i < terms.length; i++) {
          var term = terms[i];
          var inTitle = title.indexOf(term);
          var inText = text.indexOf(term);
          var inChapter = chapterTitle.indexOf(term);
          if (inTitle < 0 && inText < 0 && inChapter < 0) return;
          if (inTitle >= 0) score += inTitle === 0 || title.charAt(inTitle - 1) === ' ' ? 14 : 8;
          if (inText >= 0) score += 2 + Math.min(text.split(term).length - 2, 4) * 0.5;
          if (inChapter >= 0) score += 3;
        }
        found.push({ chapter: chapter, section: section, score: score, terms: terms });
      });
    });
    found.sort(function (a, b) {
      return b.score - a.score;
    });
    return found.slice(0, 8);
  }

  /** A few words around the first match, with every match marked. */
  function snippet(text, terms) {
    var folded = foldText(text);
    var at = -1;
    terms.forEach(function (term) {
      var i = folded.indexOf(term);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    });
    var start = Math.max(0, at - 50);
    var piece = text.slice(start, start + 150);
    if (start > 0) piece = '…' + piece.replace(/^\S*\s/, '');
    if (start + 150 < text.length) piece = piece.replace(/\s\S*$/, '') + '…';
    var fragment = document.createDocumentFragment();
    var pattern = new RegExp('(' + terms.map(escapeRegExp).join('|') + ')', 'gi');
    var foldedPiece = foldText(piece);
    var last = 0;
    var match;
    while ((match = pattern.exec(foldedPiece))) {
      if (match.index > last)
        fragment.appendChild(document.createTextNode(piece.slice(last, match.index)));
      var mark = document.createElement('mark');
      mark.textContent = piece.slice(match.index, match.index + match[0].length);
      fragment.appendChild(mark);
      last = match.index + match[0].length;
      if (match[0].length === 0) pattern.lastIndex++;
    }
    if (last < piece.length) fragment.appendChild(document.createTextNode(piece.slice(last)));
    return fragment;
  }

  function setActive(index) {
    active = index;
    var options = box.querySelectorAll('.search-result');
    Array.prototype.forEach.call(options, function (option, i) {
      option.setAttribute('aria-selected', i === index ? 'true' : 'false');
      if (i === index && option.scrollIntoView) option.scrollIntoView({ block: 'nearest' });
    });
    if (index >= 0 && options[index])
      input.setAttribute('aria-activedescendant', options[index].id);
    else input.removeAttribute('aria-activedescendant');
  }

  function close() {
    box.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  }

  function search() {
    var query = input.value.trim();
    if (!query) {
      results = [];
      box.textContent = '';
      status.textContent = '';
      close();
      return;
    }
    if (!window.QUAR_HELP_INDEX) {
      loadIndex();
      return;
    }
    results = find(query);
    box.textContent = '';
    if (results.length === 0) {
      var none = document.createElement('p');
      none.className = 'search-empty';
      none.textContent = 'Nothing in the guide matches “' + query + '”.';
      box.appendChild(none);
    }
    results.forEach(function (result, i) {
      var link = document.createElement('a');
      link.className = 'search-result';
      link.id = 'help-search-result-' + i;
      link.setAttribute('role', 'option');
      link.href = pageHref(
        helpRoot + result.chapter.slug + '/' + (result.section.id ? '#' + result.section.id : '')
      );
      var where = document.createElement('span');
      where.className = 'search-where';
      where.textContent = result.chapter.title;
      var what = document.createElement('span');
      what.className = 'search-what';
      what.textContent = result.section.id ? result.section.title : result.chapter.title;
      var words = document.createElement('span');
      words.className = 'search-snippet';
      words.appendChild(snippet(result.section.text || result.chapter.summary, result.terms));
      link.appendChild(where);
      link.appendChild(what);
      link.appendChild(words);
      box.appendChild(link);
    });
    status.textContent =
      results.length === 0
        ? 'No results'
        : results.length + (results.length === 1 ? ' result' : ' results');
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(results.length > 0 ? 0 : -1);
  }

  input.addEventListener('focus', loadIndex);
  input.addEventListener('input', search);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (results.length === 0) return;
      event.preventDefault();
      var step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      var chosen = box.querySelectorAll('.search-result')[active >= 0 ? active : 0];
      if (chosen) {
        event.preventDefault();
        window.location.href = chosen.href;
        close();
      }
    } else if (event.key === 'Escape') {
      // Clears the search first; with nothing to clear, Escape is the panel's (it closes)
      if (input.value || !box.hidden) {
        event.preventDefault();
        event.stopPropagation();
        input.value = '';
        search();
      } else {
        input.blur();
      }
    }
  });
  // A click on a result lands before the box closes
  box.addEventListener('mousedown', function (event) {
    event.preventDefault();
  });
  box.addEventListener('click', function () {
    close();
  });
  input.addEventListener('blur', function () {
    close();
  });

  // "/" goes to the search box from anywhere on the page
  document.addEventListener('keydown', function (event) {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    var target = event.target;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
      return;
    event.preventDefault();
    input.focus();
  });
});
