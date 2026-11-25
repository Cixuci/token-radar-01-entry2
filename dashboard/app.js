// Token Radar dashboard. Reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol
// detail view with the model's own inputs and the protocol's farm plan, a
// live-token view, and the calibration table. No network: every byte it
// shows is in data.js. The farm plan is the same derivation main.ts writes
// to board.json: category, chains, TVL and age, never a hand-written list.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var MODEL = DATA.model || {};
  var CAL = DATA.calibration || { global_median: 0.25, categories: {} };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return usd.format(n);
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(3) + 'x';
  }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and the calibration the board used, so the page's code and the
  // board's data are visibly the same arithmetic.
  function impliedOf(row) {
    var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * MODEL.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var maturity = MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    return { implied: Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity)), growthMult: growthMult, maturity: maturity, growthPct: growth, age: row.age_days === null || row.age_days === undefined ? null : row.age_days };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- farm plan: the same derivation main.ts writes to board.json ----
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5000000000) return 250;
    if (p.tvl_usd >= 1000000000) return 150;
    if (p.tvl_usd >= 100000000) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('risk curator') !== -1 || c.indexOf('curator') !== -1) return 'Deposit $' + capital + ' into a curator vault on ' + name + ' (' + chain + ') and keep the vault shares.';
    if (c.indexOf('onchain capital allocator') !== -1 || c.indexOf('allocator') !== -1) return 'Allocate $' + capital + ' to an allocator vault on ' + name + ' (' + chain + ') and keep the position.';
    if (c.indexOf('rwa') !== -1 || c.indexOf('real world') !== -1) return 'Mint or buy $' + capital + ' of the tokenised asset on ' + name + ' (' + chain + ') and hold it in your wallet.';
    if (c.indexOf('basis trading') !== -1 || c.indexOf('basis') !== -1) return 'Deposit $' + capital + ' of collateral into ' + name + '\'s basis vault on ' + chain + ' and keep the position open.';
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') !== -1 || c.indexOf('yield') !== -1 || c.indexOf('leveraged farm') !== -1 || c.indexOf('farm') !== -1) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and keep the position open.';
    if (c.indexOf('bridge') !== -1) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('restak') !== -1 || c.indexOf('staking') !== -1) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') !== -1 || c.indexOf('derivative') !== -1) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') !== -1) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('stable') !== -1) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('insurance') !== -1) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('governance') !== -1) return 'Deposit $' + capital + ' and vote once on an active proposal on ' + name + '.';
    if (c.indexOf('payment') !== -1) return 'Pay $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('chain') !== -1) return 'Bridge $' + capital + ' to ' + chain + ' and use ' + name + '\'s app there for one transaction.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var action = actionFor(p, capital, chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // ---- hash state (so a detail or filtered view is a link) ----
  function readHash() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0;
    state.tab = 'pre-token'; state.sort = 'implied'; state.dir = -1; state.selected = null;
    var h = window.location.hash.replace(/^#/, '');
    var parts = h ? h.split('&') : [];
    parts.forEach(function (kv) {
      var eq = kv.indexOf('=');
      if (eq < 0) return;
      var k = decodeURIComponent(kv.slice(0, eq));
      var v = decodeURIComponent(kv.slice(eq + 1));
      if (k === 'q') state.q = v;
      if (k === 'cat') state.category = v;
      if (k === 'chain') state.chain = v;
      if (k === 'tvl') state.minTvl = Number(v) || 0;
      if (k === 'tab') state.tab = v;
      if (k === 'sort') state.sort = v;
      if (k === 'dir') state.dir = v === '1' ? 1 : -1;
      if (k === 'detail') state.selected = v;
    });
  }
  function writeHash() {
    var p = [];
    if (state.q) p.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') p.push('cat=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') p.push('chain=' + encodeURIComponent(state.chain));
    if (state.minTvl) p.push('tvl=' + state.minTvl);
    if (state.tab !== 'pre-token') p.push('tab=' + state.tab);
    if (state.sort !== 'implied') p.push('sort=' + state.sort);
    if (state.dir !== -1) p.push('dir=1');
    if (state.selected) p.push('detail=' + encodeURIComponent(state.selected));
    var next = p.length ? '#' + p.join('&') : ' ';
    if (window.location.hash !== next) window.history.replaceState(null, '', next === ' ' ? window.location.pathname + window.location.search : next);
  }

  // ---- filtering and sorting ----
  function rows() {
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if ((r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function sortVal(r, key) {
    if (key === 'name') return r.name.toLowerCase();
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'growth') return r.change_7d === null || r.change_7d === undefined ? -Infinity : r.change_7d;
    if (key === 'age') return r.age_days === null || r.age_days === undefined ? -1 : r.age_days;
    return r.implied_value_usd;
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av = sortVal(a, key), bv = sortVal(b, key);
      if (av < bv) return -1 * state.dir;
      if (av > bv) return 1 * state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function maxImplied() {
    var m = 0;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > m) m = r.implied_value_usd; });
    return m || 1;
  }

  // ---- page sections ----
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'shell' },
        el('div', { class: 'brand', text: 'Token Radar' }),
        el('h1', null, 'Pre-token protocols, ranked by ', el('span', { class: 'mark', text: 'implied value' })),
        el('p', { class: 'top-meta', text: 'Snapshot ' + DATA.as_of + ' · ' + DATA.source + ' · watchlist floor ' + fmtUsd(DATA.floor_usd) + ' · ' + DATA.board_size + ' protocols ranked · model ' + DATA.model_version })
      ));
  }
  function lede() {
    return el('div', null,
      el('p', { class: 'lede' }, 'Every protocol below ', el('b', { text: 'records no token' }), ' in the snapshot is ranked by what its launch would be worth if its record stayed as it is. The multiple behind each value is calibrated from the launched protocols in the same category, so a lending protocol is not priced like a bridge. Click any row for the working behind its value and its farm plan.'),
      el('p', { class: 'sub', text: 'Implied value is this board\u2019s own claim, never a prediction that a token will be issued or when. A protocol that records no token may still have one its record does not carry.' })
    );
  }
  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search name or slug', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var tvlSel = el('select', { 'aria-label': 'Minimum TVL' },
      [['0', 'Any TVL'], ['10000000', 'TVL ≥ $10M'], ['50000000', 'TVL ≥ $50M'], ['100000000', 'TVL ≥ $100M'], ['500000000', 'TVL ≥ $500M'], ['1000000000', 'TVL ≥ $1B']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: String(state.minTvl) === o[0] ? 'selected' : null });
      })
    );
    tvlSel.addEventListener('change', function () { state.minTvl = Number(tvlSel.value) || 0; writeHash(); render(); });
    var pre = el('button', { type: 'button', class: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', class: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    var modelBtn = el('button', { type: 'button', class: 'button', 'aria-pressed': state.tab === 'model' ? 'true' : 'false', text: 'The model', onclick: function () { state.tab = 'model'; writeHash(); render(); } });
    return el('div', { class: 'panel' },
      el('div', { class: 'controls' },
        el('label', { class: 'field', text: 'Search' }, search),
        el('label', { class: 'field', text: 'Category' }, catSel),
        el('label', { class: 'field', text: 'Chain' }, chainSel),
        el('label', { class: 'field', text: 'Min TVL' }, tvlSel),
        el('div', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.rows.length + ' shown' : '' })
      ),
      el('div', { class: 'tabs' }, pre, live, modelBtn)
    );
  }
  function sortHeader(key, label, num) {
    return el('th', { class: num ? 'num' : null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      ));
  }
  function boardTable() {
    var list = sortedRows(rows());
    var max = maxImplied();
    if (list.length === 0) {
      return el('div', { class: 'panel empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Loosen the search, the category, the chain or the TVL floor.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; writeHash(); render(); } })
      );
    }
    var body = el('tbody', null);
    list.forEach(function (r) {
      var pct = r.change_7d;
      var tr = el('tr', {
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', { class: 'name' }, el('span', { text: r.name }), el('span', { class: 'cat', text: (r.category || 'Other') + ' · ' + (r.chains || []).join(', ') })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (pct === null ? '' : pct >= 0 ? 'pos' : 'neg'), text: fmtPct(pct) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num implied' }, fmtUsd(r.implied_value_usd), el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round(100 * r.implied_value_usd / max)) + '%' })))
      );
      body.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank', true),
            sortHeader('name', 'Protocol', false),
            sortHeader('tvl', 'TVL', true),
            sortHeader('growth', '7d', true),
            sortHeader('age', 'Age', true),
            sortHeader('implied', 'Implied value', true)
          )),
          body
        )
      ),
      el('p', { class: 'sub', text: 'Rank 1 is the board\u2019s most valuable protocol. Implied value is the model\u2019s claim from TVL, growth and age; the bar is relative to the top row.' })
    );
  }
  function liveTable() {
    var body = el('tbody', null);
    DATA.live.forEach(function (r) {
      body.appendChild(el('tr', null,
        el('td', { class: 'name' }, el('span', { text: r.name }), el('span', { class: 'cat', text: (r.category || 'Other') + ' · ' + (r.chains || []).join(', ') })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtPct(r.change_7d) })
      ));
    });
    return el('div', { class: 'panel' },
      el('h2', { text: 'Live token protocols' }),
      el('p', { class: 'sub', text: 'These already trade, so the board shows the market\u2019s own value for them, never a model\u2019s. They are the comparables the multiples are calibrated from, and they are never mixed into the ranked board.' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { text: 'Protocol' }),
            el('th', { class: 'num', text: 'TVL' }),
            el('th', { class: 'num', text: 'Market cap' }),
            el('th', { class: 'num', text: '7d' })
          )),
          body
        )
      )
    );
  }
  function modelPanel() {
    var cats = Object.keys(CAL.categories).sort();
    var body = el('tbody', null);
    cats.forEach(function (k) {
      var c = CAL.categories[k];
      body.appendChild(el('tr', null,
        el('td', { text: k }),
        el('td', { class: 'num', text: fmtMult(c.multiple) }),
        el('td', { class: 'num', text: c.median === null ? 'n/a' : fmtMult(c.median) }),
        el('td', { class: 'num', text: String(c.comparables) })
      ));
    });
    return el('div', { class: 'panel model' },
      el('h2', { text: 'The model, in the open' }),
      el('p', null, 'Implied value = TVL \u00d7 category multiple \u00d7 growth multiplier \u00d7 maturity multiplier. The growth multiplier clamps the seven-day TVL change to \u221260%…+120% and weights it by ' + MODEL.growth_weight + '. The maturity multiplier runs from ' + MODEL.maturity_floor + ' to ' + (MODEL.maturity_floor + MODEL.maturity_range) + ' over ' + MODEL.maturity_days + ' days, with an unknown age counted as ' + MODEL.unknown_age_days + ' days. No protocol name is special-cased: the same function scores every row.'),
      el('p', null, 'The category multiple is the median market-cap / TVL of the launched protocols in that category. Each comparable\u2019s ratio is capped at ' + fmtMult(MODEL.multiple_cap) + ' before the median is taken, so one thin-TVL token trading at hundreds of times its TVL cannot set its whole category. The median is then shrunk toward the global median (' + fmtMult(CAL.global_median) + ', ' + CAL.global_comparables + ' comparables) with weight ' + CAL.shrink_weight + ', and the result is clamped to ' + fmtMult(MODEL.multiple_floor) + '…' + fmtMult(MODEL.multiple_cap) + '. A category with no live comparable takes the global median outright.'),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { text: 'Category' }),
            el('th', { class: 'num', text: 'Multiple used' }),
            el('th', { class: 'num', text: 'Category median' }),
            el('th', { class: 'num', text: 'Comparables' })
          )),
          body
        )
      ),
      el('p', { class: 'sub', text: 'Multiples are computed from this snapshot alone, at run time, so the same snapshot always yields the same board.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  var suppressClose = false;
  dialog.addEventListener('close', function () { if (suppressClose) return; state.selected = null; writeHash(); });
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var calc = impliedOf(row);
    var key = row.category || '(no category)';
    var cal = CAL.categories[key] || { multiple: row.category_multiple, median: null, comparables: row.category_comparables };
    var steps = farmSteps(row);
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: 'Rank ' + row.rank + ' · ' + (row.category || 'Other') + ' · ' + (row.chains || []).join(', ') + ' · records no token' })
      ),
      el('button', { class: 'button close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var facts = el('div', { class: 'facts' },
      el('div', { class: 'fact' }, el('div', { class: 'k', text: 'TVL' }), el('div', { class: 'v', text: fmtUsd(row.tvl_usd) })),
      el('div', { class: 'fact' }, el('div', { class: 'k', text: '7-day change' }), el('div', { class: 'v ' + (row.change_7d === null ? '' : row.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(row.change_7d) })),
      el('div', { class: 'fact' }, el('div', { class: 'k', text: 'Age, no token' }), el('div', { class: 'v', text: fmtAge(row.age_days) })),
      el('div', { class: 'fact' }, el('div', { class: 'k', text: 'Implied value' }), el('div', { class: 'v', text: fmtFull(row.implied_value_usd) }))
    );
    var eq = 'TVL ' + fmtFull(row.tvl_usd) + '\n\u00d7 category multiple ' + fmtMult(row.category_multiple) +
      '  (' + (row.category || 'no category') + ': median ' + (cal.median === null ? 'n/a' : fmtMult(cal.median)) + ', ' + row.category_comparables + ' live comparables)\n' +
      '\u00d7 growth ' + calc.growthMult.toFixed(4) + '  (7d ' + fmtPct(row.change_7d) + ', clamped ' + fmtPct(calc.growthPct) + ')\n' +
      '\u00d7 maturity ' + calc.maturity.toFixed(4) + '  (age ' + fmtAge(row.age_days) + ')\n' +
      '= implied value ' + fmtFull(row.implied_value_usd);
    var stepList = el('ol', { class: 'steps' });
    steps.forEach(function (s) { stepList.appendChild(el('li', { text: s })); });
    dialog.appendChild(el('div', { class: 'detail-body' },
      facts,
      el('div', { class: 'detail-section' }, el('h3', { text: 'How the value is built' }), el('div', { class: 'equation' }, el('b', { text: eq }))),
      el('div', { class: 'detail-section' }, el('h3', { text: 'Farm plan' }), stepList),
      el('p', { class: 'sub', text: 'The plan is derived from this protocol\u2019s own record. It is not a promise of a token or an airdrop.' })
    ));
    if (typeof dialog.showModal === 'function') dialog.showModal();
  }

  function render() {
    if (dialog.open) { suppressClose = true; dialog.close(); suppressClose = false; }
    app.textContent = '';
    app.setAttribute('aria-busy', 'false');
    var shell = el('div', { class: 'shell' }, lede(), controls());
    if (state.tab === 'live') shell.appendChild(liveTable());
    else if (state.tab === 'model') shell.appendChild(modelPanel());
    else shell.appendChild(boardTable());
    shell.appendChild(el('p', { class: 'sub status', text: 'Model ' + DATA.model_version + ' · board ' + DATA.board_size + ' rows (' + DATA.watchlist_size + ' watchlist + ' + DATA.early_size + ' early) · live set ' + DATA.live_size + ' · snapshot ' + DATA.as_of + '.' }));
    var wrap = document.createElement('div');
    wrap.appendChild(header());
    wrap.appendChild(shell);
    while (app.firstChild) app.removeChild(app.firstChild);
    app.appendChild(wrap);
    app.appendChild(dialog);
    if (state.selected) {
      var row = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
      if (row && !dialog.open) openDetail(state.selected);
    }
  }

  window.addEventListener('hashchange', function () { readHash(); render(); });
  readHash();
  render();
})();
