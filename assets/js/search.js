var fuse;
var showButton = document.getElementById("search-button");
var showButtonMobile = document.getElementById("search-button-mobile");
var hideButton = document.getElementById("close-search-button");
var wrapper = document.getElementById("search-wrapper");
var modal = document.getElementById("search-modal");
var input = document.getElementById("search-query");
var output = document.getElementById("search-results");
var searchVisible = false;
var indexed = false;
var hasResults = false;
// Index of the result treated as "current" — highlighted by default (0, the
// top result) so Enter works straight after typing, without first pressing
// an arrow key. Arrow keys move it; it tracks real keyboard focus once that
// moves onto a result, but the input itself never loses focus for the
// top-result case, so the highlight is drawn separately from :focus (see
// highlightResult below and the .cs-search-selected rule in custom.css).
var selectedIndex = -1;

function resultLinks() {
  return Array.prototype.slice.call(output.querySelectorAll("li > a"));
}

function highlightResult(index) {
  var links = resultLinks();
  links.forEach(function (link, i) {
    link.classList.toggle("cs-search-selected", i === index);
  });
  selectedIndex = index;
}

// Listen for events
showButton ? showButton.addEventListener("click", displaySearch) : null;
showButtonMobile ? showButtonMobile.addEventListener("click", displaySearch) : null;
hideButton.addEventListener("click", hideSearch);
wrapper.addEventListener("click", hideSearch);
modal.addEventListener("click", function (event) {
  event.stopPropagation();
  event.stopImmediatePropagation();
  return false;
});
document.addEventListener("keydown", function (event) {
  // Forward slash to open search wrapper
  if (event.key == "/") {
    const active = document.activeElement;
    const tag = active.tagName;
    const isInputField = tag === "INPUT" || tag === "TEXTAREA" || active.isContentEditable;

    if (!searchVisible && !isInputField) {
      event.preventDefault();
      displaySearch();
    }
  }

  // Cmd+K (Mac) / Ctrl+K (Windows/Linux) to open search — unlike "/" this
  // works even while some other input has focus, matching the convention
  // elsewhere (Slack, GitHub, etc.), and needs preventDefault so it doesn't
  // fall through to the browser's own address-bar shortcut.
  if ((event.key == "k" || event.key == "K") && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    if (!searchVisible) {
      displaySearch();
    } else {
      input.focus();
    }
  }

  // Esc to close search wrapper
  if (event.key == "Escape") {
    hideSearch();
  }

  // Down arrow to move the highlighted result down
  if (event.key == "ArrowDown") {
    if (searchVisible && hasResults) {
      event.preventDefault();
      var links = resultLinks();
      var target = Math.min(selectedIndex + 1, links.length - 1);
      highlightResult(target);
      links[target].focus();
    }
  }

  // Up arrow to move the highlighted result up, back to the input at the top
  if (event.key == "ArrowUp") {
    if (searchVisible && hasResults) {
      event.preventDefault();
      if (selectedIndex <= 0) {
        highlightResult(0);
        input.focus();
      } else {
        var links = resultLinks();
        highlightResult(selectedIndex - 1);
        links[selectedIndex].focus();
      }
    }
  }

  // Enter goes straight to the highlighted result (the top one by default)
  if (event.key == "Enter") {
    if (searchVisible && hasResults) {
      event.preventDefault();
      if (document.activeElement == input) {
        var links = resultLinks();
        var target = selectedIndex >= 0 ? selectedIndex : 0;
        if (links[target]) links[target].click();
      } else {
        document.activeElement.click();
      }
    }
  }
});

// Update search on each keypress — but not before two letters are in, so a
// single keystroke doesn't dump the whole index into the results list.
input.onkeyup = function (event) {
  if (this.value.trim().length < 2) {
    output.innerHTML = "";
    hasResults = false;
    selectedIndex = -1;
    return;
  }
  executeQuery(this.value);
};

function displaySearch() {
  if (!indexed) {
    buildIndex();
  }
  if (!searchVisible) {
    document.body.style.overflow = "hidden";
    wrapper.style.visibility = "visible";
    input.focus();
    searchVisible = true;
  }
}

function hideSearch() {
  if (searchVisible) {
    document.body.style.overflow = "visible";
    wrapper.style.visibility = "hidden";
    input.value = "";
    output.innerHTML = "";
    selectedIndex = -1;
    document.activeElement.blur();
    searchVisible = false;
  }
}

function fetchJSON(path, callback) {
  var httpRequest = new XMLHttpRequest();
  httpRequest.onreadystatechange = function () {
    if (httpRequest.readyState === 4) {
      if (httpRequest.status === 200) {
        var data = JSON.parse(httpRequest.responseText);
        if (callback) callback(data);
      }
    }
  };
  httpRequest.open("GET", path);
  httpRequest.send();
}

function buildIndex() {
  var baseURL = wrapper.getAttribute("data-url");
  baseURL = baseURL.replace(/\/?$/, "/");
  fetchJSON(baseURL + "index.json", function (data) {
    var options = {
      // Ordering is handled entirely by sortResults() in executeQuery, not by
      // Fuse's own relevance score.
      shouldSort: false,
      ignoreLocation: true,
      threshold: 0.0,
      includeMatches: true,
      keys: [
        { name: "title", weight: 0.8 },
        { name: "section", weight: 0.2 },
        { name: "summary", weight: 0.6 },
        { name: "content", weight: 0.4 },
      ],
    };
    fuse = new Fuse(data, options);
    indexed = true;
  });
}

// CRITICAL SIGNALS: person results (item.type == "people") get their own
// card — name + "Core Team"/"Collaborator" plus event count on the left,
// a "Profile" label and thumbnail on the right — instead of the generic
// title/section/date/summary card. Dates never appear on a person card:
// event dates belong to the events, not to the person.
function personSubtitle(item) {
  var tags = item.tags || [];
  var count = item.eventCount || 0;
  var events = count === 1 ? "1 event" : count + " events";
  if (tags.indexOf("core-team") !== -1) {
    return count > 0 ? "Core Team, " + events : "Core Team";
  }
  return events;
}

// Fuse's own relevance score doesn't distinguish "matches at the start of a
// word" from "matches mid-word", so results are re-sorted after the fuzzy
// search narrows down candidates. Order: title/name matches before
// description matches; within each, a word-start match (e.g. "ka" in "Katie")
// before a mid-word one (e.g. "ka" in "annika"); ties broken alphabetically.
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchRank(text, term) {
  if (!text) return null;
  var lower = text.toLowerCase();
  if (lower.indexOf(term) === -1) return null;
  return new RegExp("\\b" + escapeRegExp(term)).test(lower) ? 0 : 1;
}

function resultRank(item, term) {
  var titleRank = matchRank(item.title, term);
  if (titleRank !== null) return titleRank; // 0 or 1
  var descriptionRank = matchRank((item.summary || "") + " " + (item.content || ""), term);
  if (descriptionRank !== null) return 2 + descriptionRank; // 2 or 3
  return 4; // matched on some other field (e.g. section) only
}

function sortResults(results, term) {
  var lowerTerm = term.toLowerCase();
  results.sort(function (a, b) {
    var rankDiff = resultRank(a.item, lowerTerm) - resultRank(b.item, lowerTerm);
    return rankDiff !== 0 ? rankDiff : a.item.title.localeCompare(b.item.title);
  });
  return results;
}

function executeQuery(term) {
  let results = sortResults(fuse.search(term), term);
  let resultsHTML = "";

  if (results.length > 0) {
    results.forEach(function (value, key) {
      var html = value.item.summary;
      var div = document.createElement("div");
      div.innerHTML = html;
      value.item.summary = div.textContent || div.innerText || "";
      var title = value.item.externalUrl
        ? value.item.title +
          '<span class="text-xs ml-2 align-center cursor-default text-neutral-400 dark:text-neutral-500">' +
          value.item.externalUrl +
          "</span>"
        : value.item.title;
      var linkconfig = value.item.externalUrl
        ? 'target="_blank" rel="noopener" href="' + value.item.externalUrl + '"'
        : 'href="' + value.item.permalink + '"';

      var isPerson = value.item.type === "people";
      var subtitleHTML = isPerson
        ? personSubtitle(value.item)
        : `${value.item.section}<span class="px-2 text-primary-500">&middot;</span>${value.item.date ? value.item.date : ""}`;
      var bodyHTML = isPerson ? "" : `<div class="text-sm italic">${value.item.summary}</div>`;
      // Sized/greyed/positioned via inline style rather than Tailwind utility
      // classes: this HTML is assembled at runtime, so it never gets scanned
      // by the Tailwind build and classes with no other user in the site
      // (e.g. an arbitrary-value size, `grayscale`) get purged from the
      // theme's precompiled CSS — see custom.css's #search-results comment.
      // The photo is a cover-cropped rectangle bleeding to the card's top,
      // right and bottom edges (not a circle) — align-self:stretch fills the
      // anchor's cross-axis (its height, since the anchor is items-center by
      // default per-child override), and the negative margins cancel the
      // anchor's own padding (px-3 = 0.75rem, py-2 = 0.5rem) on those three
      // sides so it actually reaches them. `overflow:hidden` on the anchor
      // clips the photo's square corners to the card's own rounded-md curve.
      var asideHTML =
        isPerson && value.item.image
          ? `<img src="${value.item.image}" alt="" style="align-self:stretch;width:60px;max-width:60px;object-fit:cover;filter:grayscale(1);flex-shrink:0;margin-left:0.5rem;margin-right:-0.75rem;margin-top:-0.5rem;margin-bottom:-0.5rem;">`
          : "";

      resultsHTML =
        resultsHTML +
        `<li class="mb-2">
          <a class="flex items-center px-3 py-2 rounded-md appearance-none bg-neutral-100 dark:bg-neutral-700 focus:bg-primary-100 hover:bg-primary-100 dark:hover:bg-primary-900 dark:focus:bg-primary-900 focus:outline-dotted focus:outline-transparent focus:outline-2"
          style="overflow:hidden"
          ${linkconfig} tabindex="0">
            <div class="grow">
              <div class="-mb-1 text-lg font-bold">
                ${title}
              </div>
              <div class="text-sm text-neutral-500 dark:text-neutral-400">${subtitleHTML}</div>
              ${bodyHTML}
            </div>
            ${asideHTML}
          </a>
        </li>`;
    });
    hasResults = true;
  } else {
    resultsHTML = "";
    hasResults = false;
  }

  output.innerHTML = resultsHTML;
  if (results.length > 0) {
    highlightResult(0);
  } else {
    selectedIndex = -1;
  }
}
