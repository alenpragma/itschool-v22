/* ==========================================================================
   data-loader.js — THE SEAM BETWEEN STATIC JSON AND A LIVE BACKEND
   --------------------------------------------------------------------------
   This is the only file that knows where content comes from. Everything else
   (renderers.js, main.js, the pages) is source-agnostic.

   ┌── CONNECTING A BACKEND: THREE EDITS ────────────────────────────────────┐
   │ 1. useStaticJson: false                                                 │
   │ 2. apiBase: 'https://api.your-school.example/v1'                        │
   │ 3. make the endpoint map below match your routes                        │
   │                                                                         │
   │ Then set <body data-live="true"> (build.js substitutes it via {{LIVE}})  │
   │ so the loader hydrates runtime data instead of trusting baked markup.   │
   │                                                                         │
   │ Full request/response contract: docs/API_CONTRACT.md                    │
   └─────────────────────────────────────────────────────────────────────────┘

   WHY THE PAGE STILL WORKS WITHOUT A BACKEND
   build.js pre-renders every list from the same fixtures, so the HTML is
   complete before this file runs. Hydration only REPLACES contents once a
   response lands. A dead API therefore cannot blank the page — the worst case
   is that the visitor reads the build-time copy. That is the intended
   degradation, and it is why the loading/error states are non-destructive.

   EXPECTED PAYLOAD SHAPES (see src/data/*.json for working examples)
     site      -> { brand, nav, contact, campuses, hero, pillars, … }
     teachers  -> { leadership: [...], staff: [...] }
     notices   -> { items: [...] }
     events    -> { items: [...] }
     gallery   -> { items: [...] }
     blog      -> { items: [...] }
   ========================================================================== */
(function (root, factory) {
  /* UMD, like renderers.js: `require()`d by the tests in Node, and attached to
     window as EDU.* in the browser. The pure helpers are exported so they can
     be unit-tested with no DOM and no network. */
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EDU = root.EDU || {};
    Object.keys(api).forEach(function (key) {
      root.EDU[key] = api[key];
    });
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------- config --- */
  /* The single switch. Nothing else in the codebase reads a content URL. */
  var config = {
    /* true  -> read the JSON fixtures. The shipped default: this is a frozen
                static build, so every page must work with no backend.
       false -> read config.apiBase + endpoints[key].api. */
    useStaticJson: true,

    /* Folder holding the static fixtures, RELATIVE TO THE SITE ROOT. The root
       is resolved at call time from this script's own URL, so it works from a
       root page and from a detail page one level down with no per-page config. */
    dataDir: 'data/',

    /* Your backend base URL. No trailing slash. */
    apiBase: '',

    /* Per-request timeout (ms). 0 disables it. */
    timeout: 10000,

    /* Static file name <-> REST path — the whole data contract in one map. */
    endpoints: {
      site: { json: 'site.json', api: '/site' },
      teachers: { json: 'teachers.json', api: '/teachers' },
      notices: { json: 'notices.json', api: '/notices' },
      events: { json: 'events.json', api: '/events' },
      gallery: { json: 'gallery.json', api: '/gallery' },
      blog: { json: 'blog.json', api: '/blog' }
    }
  };

  /* Resolved payloads, so a page reading several lists from one source issues
     exactly one request. */
  var cache = {};
  /* Last pagination envelope, so pagination can be added without changing any
     caller. Null until a backend sends one. */
  var lastPage = null;

  /* ----------------------------------------------------------- utilities --- */

  /**
   * Absolute URL of the site root, derived from this script's own src.
   *
   * A bare 'data/blog.json' would resolve against the CURRENT page, giving the
   * right answer only on a root page — from blog/<slug>.html it resolves to
   * blog/data/blog.json and 404s. Anchoring to <script src> is correct at any
   * depth and under any host rewrite.
   */
  function siteRoot(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      return '';
    }
    var s = doc.currentScript;
    if (!s || !s.src) {
      /* Called after load, so currentScript is null: find our own tag. */
      var all = doc.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if (/data-loader\.js/.test(all[i].src)) {
          s = all[i];
          break;
        }
      }
    }
    if (!s || !s.src) {
      return '';
    }
    /* Strip the script's own path, leaving the site root with a trailing '/'. */
    return s.src.replace(/assets\/js\/data-loader\.js.*$/, '');
  }

  /** Resolve the URL for one named source. Pure — testable without a DOM. */
  function resolveUrl(key, cfg, rootUrl) {
    cfg = cfg || config;
    var ep = cfg.endpoints[key];
    if (!ep) {
      throw new Error('[EDU] unknown data source: ' + key);
    }
    if (cfg.useStaticJson) {
      return (rootUrl === undefined ? siteRoot() : rootUrl) + cfg.dataDir + ep.json;
    }
    if (!cfg.apiBase) {
      throw new Error('[EDU] apiBase is empty but useStaticJson is false');
    }
    return cfg.apiBase + ep.api;
  }

  /**
   * Normalise a payload into an array for a view.
   *
   * Accepts both `{ items: [...] }` (the documented envelope) and a bare
   * array, so a backend returning `[...]` directly still works. Returns null
   * when the path does not resolve to an array, which the caller treats as
   * "nothing to render" rather than silently as an empty collection.
   */
  function pick(payload, path) {
    var value = payload;
    if (path) {
      var parts = String(path).split('.');
      for (var i = 0; i < parts.length; i++) {
        if (value === null || value === undefined) {
          return null;
        }
        value = value[parts[i]];
      }
    }
    return Array.isArray(value) ? value : null;
  }

  /** Apply a `data-limit` cap. 0 / NaN / negative means "no cap". */
  function limitList(list, limit) {
    var n = parseInt(limit, 10);
    if (!isFinite(n) || n <= 0) {
      return list;
    }
    return list.slice(0, n);
  }

  /* --------------------------------------------------------- state markup --- */

  /* Per-state copy. Empty is overridable per container via data-empty. */
  var MESSAGES = {
    empty: 'Nothing to show here yet.',
    error: 'This section could not be updated. Showing the last known version.'
  };

  /** Remove every state class and the message node. Idempotent. */
  function clearState(el) {
    el.classList.remove('is-loading', 'is-empty', 'is-error');
    el.removeAttribute('aria-busy');
    var notes = el.querySelectorAll('.data-note');
    for (var i = 0; i < notes.length; i++) {
      notes[i].parentNode.removeChild(notes[i]);
    }
  }

  /** Mark a container as loading. aria-busy is the accessible "spinner". */
  function setLoading(el) {
    clearState(el);
    el.classList.add('is-loading');
    el.setAttribute('aria-busy', 'true');
  }

  /**
   * Mark a container empty or errored, with a message.
   *
   * `wipe` is only ever true for the empty state: an empty collection means
   * the old content really is stale, whereas an ERROR must leave the last good
   * markup in place (see the note at the top of this file).
   */
  function setState(el, kind, msg, wipe) {
    clearState(el);
    el.classList.add('is-' + kind);
    if (wipe) {
      el.innerHTML = '';
    }
    var note = el.ownerDocument.createElement('p');
    note.className = 'data-note';
    note.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    note.textContent = msg || MESSAGES[kind] || '';
    el.appendChild(note);
  }

  /* ------------------------------------------------------------ requests --- */

  /**
   * Load one named source. Resolves with the parsed payload.
   *
   * The timeout matters for real backends: `fetch` has no default timeout, so
   * a hung API would leave containers in `is-loading` forever. We abort after
   * config.timeout and surface an ordinary error instead.
   *
   * @param {string} key
   * @param {{reload?: boolean}} [opts]
   */
  function load(key, opts) {
    opts = opts || {};
    if (cache[key] && !opts.reload) {
      return cache[key];
    }

    var url;
    try {
      url = resolveUrl(key);
    } catch (err) {
      return Promise.reject(err);
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    if (controller && config.timeout > 0) {
      timer = setTimeout(function () {
        controller.abort();
      }, config.timeout);
    }

    function stopTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    var request = fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (!res.ok) {
          var httpErr = new Error('[EDU] ' + key + ' -> HTTP ' + res.status + ' (' + url + ')');
          httpErr.status = res.status;
          httpErr.url = url;
          httpErr.source = key;
          throw httpErr;
        }
        return res.text().then(function (body) {
          try {
            return JSON.parse(body);
          } catch {
            /* An HTML error page would otherwise surface as a confusing
               "Unexpected token <" — name the real problem instead. */
            var err = new Error('[EDU] ' + key + ' -> response was not JSON (' + url + ')');
            err.url = url;
            err.source = key;
            throw err;
          }
        });
      })
      .then(function (payload) {
        /* Remember pagination metadata if the backend sends it. Purely
           additive: an envelope without these keys behaves as before. */
        if (payload && !Array.isArray(payload)) {
          lastPage = {
            total: payload.total,
            page: payload.page,
            pageSize: payload.pageSize,
            nextCursor: payload.nextCursor
          };
        }
        return payload;
      })
      .catch(function (err) {
        delete cache[key]; /* never cache a failure — let a later call retry */
        throw err;
      });

    /* Wrap so the timer is always cleared, on success and failure alike. */
    var guarded = request.then(
      function (payload) {
        stopTimer();
        return payload;
      },
      function (err) {
        stopTimer();
        throw err;
      }
    );

    cache[key] = guarded;
    return guarded;
  }

  /* view name -> renderer name supplied by renderers.js */
  var VIEWS = {
    pillars: 'pillarCard',
    stats: 'statCard',
    features: 'featureCard',
    gallery: 'galleryItem',
    teachers: 'teacherCard',
    leadership: 'memberCard',
    notices: 'noticeRow',
    noticesFull: 'announcementRow',
    events: 'eventRow',
    eventsFull: 'eventRowFull',
    blog: 'postCard',
    initiatives: 'initiativeCard',
    classes: 'classCard'
  };

  /** Resolve a view name to a renderer function. Pure; null when unknown. */
  function viewRenderer(view, render) {
    var name = VIEWS[view];
    if (!name || !render || typeof render[name] !== 'function') {
      return null;
    }
    return render[name];
  }

  /**
   * Render one container from an already-loaded payload.
   * Extracted from hydrate() so tests can drive it with no network and no DOM
   * beyond a stub element.
   *
   * @param {Element} el
   * @param {*} payload
   * @param {{pick?: string, view?: string, limit?: string|number}} spec
   * @param {object} render  the EDU.render namespace
   * @returns {'ok'|'empty'|'skipped'}
   */
  function paint(el, payload, spec, render) {
    var list = pick(payload, spec.pick);
    if (list === null) {
      /* Path did not resolve to an array: a contract mismatch, not an empty
         collection. Report it distinctly and keep the page intact. */
      return 'skipped';
    }
    if (!list.length) {
      return 'empty';
    }
    var fn = viewRenderer(spec.view, render);
    if (!fn) {
      return 'skipped';
    }
    el.innerHTML = render.renderList(limitList(list, spec.limit), fn);
    return 'ok';
  }

  /**
   * Find every [data-source] container and render it.
   *
   * A container looks like:
   *   <div data-source="teachers" data-pick="staff" data-view="teachers"></div>
   *   <div data-source="notices" data-pick="items" data-view="notices"
   *        data-limit="3" data-empty="No notices yet."></div>
   *
   * @param {Document} [doc]
   * @param {object}   [render]  defaults to the global EDU.render
   * @returns {Promise<boolean>} true when at least one container was hydrated
   */
  function hydrate(doc, render) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      return Promise.resolve(false);
    }
    render = render || (typeof EDU !== 'undefined' ? EDU.render : null);
    if (!render) {
      return Promise.resolve(false);
    }

    var live = doc.body && doc.body.getAttribute('data-live') === 'true';
    var containers = doc.querySelectorAll('[data-source]');
    if (!containers.length) {
      return Promise.resolve(false);
    }
    if (!live) {
      /* Static build: build.js already wrote the final HTML into each
         container. Leave it alone — this keeps the shipped page identical
         whether or not the visitor's JS runs. */
      return Promise.resolve(false);
    }

    var jobs = Array.prototype.map.call(containers, function (el) {
      var spec = {
        source: el.getAttribute('data-source'),
        pick: el.getAttribute('data-pick'),
        view: el.getAttribute('data-view'),
        limit: el.getAttribute('data-limit')
      };
      var emptyCopy = el.getAttribute('data-empty') || MESSAGES.empty;

      setLoading(el);

      return load(spec.source)
        .then(function (payload) {
          var outcome = paint(el, payload, spec, render);
          if (outcome === 'ok') {
            clearState(el);
            if (typeof EDU !== 'undefined' && EDU.refreshReveal) {
              EDU.refreshReveal();
            }
          } else if (outcome === 'empty') {
            /* The collection really is empty, so wiping is correct. */
            setState(el, 'empty', emptyCopy, true);
          } else {
            /* Malformed payload: keep the baked markup, flag it. */
            setState(el, 'error', 'This section could not be updated.', false);
          }
        })
        .catch(function (err) {
          /* Never blank the page. Loud for the developer, gentle for the
             visitor, and the build-time content survives untouched. */
          console.error(err);
          setState(el, 'error', MESSAGES.error, false);
        });
    });

    return Promise.all(jobs).then(function () {
      return true;
    });
  }

  /** Clear the request cache (tests, and a manual "refresh" affordance). */
  function reset() {
    cache = {};
    lastPage = null;
  }

  /** Read pagination metadata from the most recent successful load. */
  function getLastPage() {
    return lastPage;
  }

  return {
    config: config,
    MESSAGES: MESSAGES,
    VIEWS: VIEWS,
    /* pure helpers — unit-tested in tests/data-loader.test.js */
    resolveUrl: resolveUrl,
    pick: pick,
    limitList: limitList,
    viewRenderer: viewRenderer,
    paint: paint,
    siteRoot: siteRoot,
    getLastPage: getLastPage,
    /* state helpers */
    clearState: clearState,
    setLoading: setLoading,
    setState: setState,
    /* side-effecting */
    load: load,
    hydrate: hydrate,
    reset: reset
  };
});
