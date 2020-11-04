(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('node-fetch')) :
  typeof define === 'function' && define.amd ? define(['node-fetch'], factory) :
  (global = global || self, global.ia = factory(global.fetch));
}(this, (function (fetch) { 'use strict';

  fetch = fetch && Object.prototype.hasOwnProperty.call(fetch, 'default') ? fetch['default'] : fetch;

  const enc = encodeURIComponent;
  const REQUIRED = "__REQUIRED__";
  let CORS_PROXY = "https://iajs-cors.rchrd2.workers.dev";

  const isInBrowser = () => {
    return !(typeof window === "undefined");
  };

  const corsWorkAround = (url) => {
    if (isInBrowser()) {
      return `${CORS_PROXY}/${url}`;
    } else {
      return url;
    }
  };

  const fetchJson = async function (url, options) {
    const res = await fetch(url, options);
    return await res.json();
  };

  const authToHeader = function (auth) {
    return auth.values.s3.access && auth.values.s3.secret
      ? {
          Authorization: `LOW ${auth.values.s3.access}:${auth.values.s3.secret}`,
        }
      : {};
  };

  const newEmptyAuth = function () {
    return JSON.parse(
      JSON.stringify({
        success: false,
        values: {
          cookies: {},
          email: null,
          itemname: null,
          s3: { access: null, secret: null },
          screenname: null,
        },
        version: 1,
      })
    );
  };

  class Auth {
    constructor() {
      this.XAUTH_URL = corsWorkAround(
        "https://archive.org/services/xauthn/?op=login"
      );
    }
    async login(email, password) {
      try {
        const fetchOptions = {
          method: "POST",
          body: `email=${enc(email)}&password=${enc(password)}`,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        };
        const response = await fetch(this.XAUTH_URL, fetchOptions);
        const data = await response.json();
        if (!data.success) {
          data.values = { ...data.values, ...newEmptyAuth().values };
        }
        return data;
      } catch (e) {
        // TODO figure out syntax for catching error reponse
        return newEmptyAuth();
      }
    }
    async fromS3(access, secret) {
      const newAuth = newEmpthAuth();
      newAuth.success = 1;
      newAuth.values.s3.access = access;
      newAuth.values.s3.secret = secret;
      const info = await fetchJson("https://s3.us.archive.org?check_auth=1", {
        headers: authToHeader(auth),
      });
      newAuth.values.email = info.username;
      newAuth.values.itemname = info.itemname;
      newAuth.values.screenname = info.screenname;
      // Note the auth object is missing cookie fields.
      // It is still TBD if those are needed
      return newAuth;
    }
  }

  class BookReaderAPI {}

  class GifcitiesAPI {
    constructor() {
      this.API_BASE = "https://gifcities.archive.org/api/v1/gifsearch";
    }
    async get({ q = null } = {}) {
      if (q === null) return [];
      return fetchJson(`${this.API_BASE}?q=${encodeURIComponent(q)}`);
    }
    async search(q) {
      return this.get({ q });
    }
  }

  class MetadataAPI {
    constructor() {
      this.API_BASE = "https://archive.org/metadata";
    }
    async get({ identifier = null, path = "", auth = newEmptyAuth() } = {}) {
      const options = {};
      if (auth.values.s3.access) {
        options.headers = authToHeader(auth);
      }
      return fetchJson(`${this.API_BASE}/${identifier}/${path}`, options);
    }
    async patch({
      identifier = null,
      target = "metadata",
      patch = {},
      auth = newEmptyAuth(),
    } = {}) {
      // https://archive.org/services/docs/api/metadata.html#targets
      const reqParams = {
        "-target": target,
        "-patch": JSON.stringify(patch),
        secret: auth.values.s3.secret,
        access: auth.values.s3.access,
      };
      const url = corsWorkAround(`${this.API_BASE}/${identifier}`);
      const body = new URLSearchParams(reqParams).toString();
      const response = await fetch(url, {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      return await response.json();
    }
  }

  class RelatedAPI {
    constructor() {
      this.API_BASE = "https://be-api.us.archive.org/mds/v1";
    }
    async get({ identifier = null } = {}) {
      return fetchJson(`${this.API_BASE}/get_related/all/${identifier}`);
    }
  }

  class ReviewsAPI {
    constructor() {
      this.WRITE_API_BASE = corsWorkAround(
        "https://archive.org/services/reviews.php?identifier="
      );
      this.READ_API_BASE = "https://archive.org/metadata/";
    }
    async get({ identifier = null } = {}) {
      return fetchJson(`${this.READ_API_BASE}/${identifier}/reviews`);
    }
    async add({
      identifier = null,
      title = null,
      body = null,
      stars = null,
      auth = newEmptyAuth(),
    } = {}) {
      const url = `${this.WRITE_API_BASE}${identifier}`;
      const response = await fetch(url, {
        method: "POST",
        body: JSON.stringify({ title, body, stars }),
        headers: {
          "Content-Type": "application/json",
          ...authToHeader(auth),
        },
      });
      return await response.json();
    }
  }

  class SearchAPI {
    constructor() {
      this.API_BASE = "https://archive.org/advancedsearch.php";
    }
    async get({
      q = REQUIRED,
      page = 1,
      fields = ["identifier"],
      ...options
    } = {}) {
      if (typeof q == "object") {
        q = this.buildQueryFromObject(q);
      }
      const reqParams = {
        q,
        page,
        fl: fields,
        ...options,
        output: "json",
      };
      // let required = checkRequired(reqParams);
      // if (required !== null) {
      //   return { required };
      // }
      const encodedParams = new URLSearchParams(reqParams).toString();
      const url = `${this.API_BASE}?${encodedParams}`;
      return fetchJson(url);
    }
    async search(q) {
      return await this.get({ q });
    }
    buildQueryFromObject(qObject) {
      // Map dictionary to a key=val search query
      return Object.keys(qObject)
        .map((key) => {
          if (Array.isArray(qObject[key])) {
            return `${key}:( ${qObject[key].map((v) => `"${v}"`).join(" OR ")} )`;
          } else {
            return `${key}=${qObject[key]}`;
          }
        })
        .join(" AND ");
    }
  }

  class SearchTextAPI {}

  class ViewsAPI {
    constructor() {
      // https://be-api.us.archive.org/views/v1/short/<identifier>[,<identifier>,...]
      this.API_BASE = "https://be-api.us.archive.org/views/v1/short";
    }
    async get({ identifier = null } = {}) {
      identifier = Array.isArray(identifier) ? identifier.join(",") : identifier;
      return fetchJson(`${this.API_BASE}/${identifier}`);
    }
  }

  class WaybackAPI {}

  var main = {
    Auth: new Auth(),
    BookReaderAPI: new BookReaderAPI(),
    GifcitiesAPI: new GifcitiesAPI(),
    MetadataAPI: new MetadataAPI(),
    RelatedAPI: new RelatedAPI(),
    ReviewsAPI: new ReviewsAPI(),
    SearchAPI: new SearchAPI(),
    SearchTextAPI: new SearchTextAPI(),
    ViewsAPI: new ViewsAPI(),
    WaybackAPI: new WaybackAPI(),
    CORS_PROXY,
  };

  return main;

})));
