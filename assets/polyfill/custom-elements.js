!(function () {
  "use strict";
  var e = (e, t) => {
    const n = (e) => {
        for (let t = 0, { length: n } = e; t < n; t++) o(e[t]);
      },
      o = ({ target: e, attributeName: t, oldValue: n }) => {
        e.attributeChangedCallback(t, n, e.getAttribute(t));
      };
    return (r, s) => {
      const { observedAttributes: l } = r.constructor;
      return (
        l &&
          e(s).then(() => {
            new t(n).observe(r, {
              attributes: !0,
              attributeOldValue: !0,
              attributeFilter: l,
            });
            for (let e = 0, { length: t } = l; e < t; e++)
              r.hasAttribute(l[e]) &&
                o({ target: r, attributeName: l[e], oldValue: null });
          }),
        r
      );
    };
  };
  /*! (c) Andrea Giammarchi - ISC */ const t = !0,
    n = !1,
    o = "querySelectorAll",
    r = "querySelectorAll",
    { document: s, Element: l, MutationObserver: c, Set: a, WeakMap: i } = self,
    u = (e) => r in e,
    { filter: f } = [];
  var h = (e) => {
    const h = new i(),
      d = (t, n) => {
        let o;
        if (n)
          for (
            let r,
              s = ((e) =>
                e.matches || e.webkitMatchesSelector || e.msMatchesSelector)(t),
              l = 0,
              { length: c } = g;
            l < c;
            l++
          )
            s.call(t, (r = g[l])) &&
              (h.has(t) || h.set(t, new a()),
              (o = h.get(t)),
              o.has(r) || (o.add(r), e.handle(t, n, r)));
        else
          h.has(t) &&
            ((o = h.get(t)),
            h.delete(t),
            o.forEach((o) => {
              e.handle(t, n, o);
            }));
      },
      p = (e, t = !0) => {
        for (let n = 0, { length: o } = e; n < o; n++) d(e[n], t);
      },
      { query: g } = e,
      m = e.root || s,
      y = ((e, r = document, s = MutationObserver, l = ["*"]) => {
        const c = (n, r, s, l, a, i) => {
            for (const u of n)
              (i || o in u) &&
                (a
                  ? s.has(u) || (s.add(u), l.delete(u), e(u, a))
                  : l.has(u) || (l.add(u), s.delete(u), e(u, a)),
                i || c(u[o](r), r, s, l, a, t));
          },
          a = new s((e) => {
            if (l.length) {
              const o = l.join(","),
                r = new Set(),
                s = new Set();
              for (const { addedNodes: l, removedNodes: a } of e)
                c(a, o, r, s, n, n), c(l, o, r, s, t, n);
            }
          }),
          { observe: i } = a;
        return (
          (a.observe = (e) => i.call(a, e, { subtree: t, childList: t }))(r), a
        );
      })(d, m, c, g),
      { attachShadow: w } = l.prototype;
    return (
      w &&
        (l.prototype.attachShadow = function (e) {
          const t = w.call(this, e);
          return y.observe(t), t;
        }),
      g.length && p(m[r](g)),
      {
        drop: (e) => {
          for (let t = 0, { length: n } = e; t < n; t++) h.delete(e[t]);
        },
        flush: () => {
          const e = y.takeRecords();
          for (let t = 0, { length: n } = e; t < n; t++)
            p(f.call(e[t].removedNodes, u), !1),
              p(f.call(e[t].addedNodes, u), !0);
        },
        observer: y,
        parse: p,
      }
    );
  };
  const {
      document: d,
      Map: p,
      MutationObserver: g,
      Object: m,
      Set: y,
      WeakMap: w,
      Element: b,
      HTMLElement: E,
      Node: S,
      Error: v,
      TypeError: M,
      Reflect: O,
    } = self,
    {
      defineProperty: A,
      keys: N,
      getOwnPropertyNames: q,
      setPrototypeOf: C,
    } = m;
  let T = !self.customElements;
  const D = (e) => {
    const t = N(e),
      n = [],
      o = new y(),
      { length: r } = t;
    for (let s = 0; s < r; s++) {
      n[s] = e[t[s]];
      try {
        delete e[t[s]];
      } catch (e) {
        o.add(s);
      }
    }
    return () => {
      for (let s = 0; s < r; s++) o.has(s) || (e[t[s]] = n[s]);
    };
  };
  if (T) {
    const { createElement: P } = d,
      $ = new p(),
      k = new p(),
      L = new p(),
      x = new p(),
      H = [],
      I = (e, t, n) => {
        const o = L.get(n);
        if (t && !o.isPrototypeOf(e)) {
          const t = D(e);
          R = C(e, o);
          try {
            new o.constructor();
          } finally {
            (R = null), t();
          }
        }
        const r = (t ? "" : "dis") + "connectedCallback";
        r in o && e[r]();
      },
      { parse: _ } = h({ query: H, handle: I });
    let R = null;
    const V = (e) => {
        if (!k.has(e)) {
          let t,
            n = new Promise((e) => {
              t = e;
            });
          k.set(e, { $: n, _: t });
        }
        return k.get(e).$;
      },
      j = e(V, g);
    function W() {
      const { constructor: e } = this;
      if (!$.has(e)) throw new M("Illegal constructor");
      const t = $.get(e);
      if (R) return j(R, t);
      const n = P.call(d, t);
      return j(C(n, e.prototype), t);
    }
    (self.customElements = {
      define: (e, t) => {
        if (x.has(e))
          throw new v(
            `the name "${e}" has already been used with this registry`
          );
        $.set(t, e),
          L.set(e, t.prototype),
          x.set(e, t),
          H.push(e),
          V(e).then(() => {
            _(d.querySelectorAll(e));
          }),
          k.get(e)._(t);
      },
      get: (e) => x.get(e),
      whenDefined: V,
    }),
      A((W.prototype = E.prototype), "constructor", { value: W }),
      (self.HTMLElement = W),
      (d.createElement = function (e, t) {
        const n = t && t.is,
          o = n ? x.get(n) : x.get(e);
        return o ? new o() : P.call(d, e);
      }),
      "isConnected" in S.prototype ||
        A(S.prototype, "isConnected", {
          configurable: !0,
          get() {
            return !(
              this.ownerDocument.compareDocumentPosition(this) &
              this.DOCUMENT_POSITION_DISCONNECTED
            );
          },
        });
  } else if (((T = !self.customElements.get("extends-br")), T))
    try {
      function B() {
        return self.Reflect.construct(HTMLBRElement, [], B);
      }
      B.prototype = HTMLLIElement.prototype;
      const F = "extends-br";
      self.customElements.define("extends-br", B, { extends: "br" }),
        (T = d.createElement("br", { is: F }).outerHTML.indexOf(F) < 0);
      const { get: U, whenDefined: z } = self.customElements;
      self.customElements.whenDefined = function (e) {
        return z.call(this, e).then((t) => t || U.call(this, e));
      };
    } catch (G) {}
  if (T) {
    const J = self.customElements,
      { createElement: K } = d,
      { define: Q, get: X, upgrade: Y } = J,
      { construct: Z } = O || {
        construct(e) {
          return e.call(this);
        },
      },
      ee = new w(),
      te = new y(),
      ne = new p(),
      oe = new p(),
      re = new p(),
      se = new p(),
      le = [],
      ce = [],
      ae = (e) => se.get(e) || X.call(J, e),
      ie = (e, t, n) => {
        const o = re.get(n);
        if (t && !o.isPrototypeOf(e)) {
          const t = D(e);
          ge = C(e, o);
          try {
            new o.constructor();
          } finally {
            (ge = null), t();
          }
        }
        const r = (t ? "" : "dis") + "connectedCallback";
        r in o && e[r]();
      },
      { parse: ue } = h({ query: ce, handle: ie }),
      { parse: fe } = h({
        query: le,
        handle(e, t) {
          ee.has(e) &&
            (t ? te.add(e) : te.delete(e), ce.length && me.call(ce, e));
        },
      }),
      { attachShadow: he } = b.prototype;
    he &&
      (b.prototype.attachShadow = function (e) {
        const t = he.call(this, e);
        return ee.set(this, t), t;
      });
    const de = (e) => {
        if (!oe.has(e)) {
          let t,
            n = new Promise((e) => {
              t = e;
            });
          oe.set(e, { $: n, _: t });
        }
        return oe.get(e).$;
      },
      pe = e(de, g);
    let ge = null;
    function me(e) {
      const t = ee.get(e);
      ue(t.querySelectorAll(this), e.isConnected);
    }
    q(self)
      .filter((e) => /^HTML.*Element$/.test(e))
      .forEach((e) => {
        const t = self[e];
        function n() {
          const { constructor: e } = this;
          if (!ne.has(e)) throw new M("Illegal constructor");
          const { is: n, tag: o } = ne.get(e);
          if (n) {
            if (ge) return pe(ge, n);
            const t = K.call(d, o);
            return t.setAttribute("is", n), pe(C(t, e.prototype), n);
          }
          return Z.call(this, t, [], e);
        }
        C(n, t),
          A((n.prototype = t.prototype), "constructor", { value: n }),
          A(self, e, { value: n });
      }),
      (d.createElement = function (e, t) {
        const n = t && t.is;
        if (n) {
          const t = se.get(n);
          if (t && ne.get(t).tag === e) return new t();
        }
        const o = K.call(d, e);
        return n && o.setAttribute("is", n), o;
      }),
      (J.get = ae),
      (J.whenDefined = de),
      (J.upgrade = function (e) {
        const t = e.getAttribute("is");
        if (t) {
          const n = se.get(t);
          if (n) return void pe(C(e, n.prototype), t);
        }
        Y.call(J, e);
      }),
      (J.define = function (e, t, n) {
        if (ae(e))
          throw new v(`'${e}' has already been defined as a custom element`);
        let o;
        const r = n && n.extends;
        ne.set(t, r ? { is: e, tag: r } : { is: "", tag: e }),
          r
            ? ((o = `${r}[is="${e}"]`),
              re.set(o, t.prototype),
              se.set(e, t),
              ce.push(o))
            : (Q.apply(J, arguments), le.push((o = e))),
          de(e).then(() => {
            r
              ? (ue(d.querySelectorAll(o)), te.forEach(me, [o]))
              : fe(d.querySelectorAll(o));
          }),
          oe.get(e)._(t);
      });
  }
})();
