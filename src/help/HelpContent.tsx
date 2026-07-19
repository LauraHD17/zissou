// Plain-language guide to every feature and control. Reached two ways: the
// "?" button in the StatusBar (one tap, every view) and the Help link at the
// top of Settings. Content only; no state beyond the Back action.
//
// Keep the language at a lower-secondary reading level (AAA 3.1.5) and keep
// this file in sync with shipped behavior — it is the app's manual.

import { Icon } from '../icons';

export function HelpContent({
  onBack,
  backLabel = 'Back to settings',
}: {
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <div className="settings-form help">
      <h2 id="settings-title" className="settings-form__title">
        How to use this app
      </h2>

      {/* A button at the TOP as well as the bottom: it's the first focusable,
          so the panel opens scrolled to the start of the guide (SlidePanel
          focuses the first control) — and nobody has to scroll a long guide
          just to leave it. */}
      <button type="button" className="settings-form__secondary" onClick={onBack}>
        {backLabel}
      </button>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">The top bar</h3>
        <p className="help__row">
          <strong>GPS OK / GPS stale / no fix</strong> — green means a live position; amber means
          the last fix is more than 30 seconds old; red means no position yet. The phone's GPS works
          with no cell signal.
        </p>
        <p className="help__row">
          Next to it: the time, tonight's sunset (or sunrise), and the tide — nearest station, which
          way it's moving, and the next high or low. A ~ means live NOAA data isn't loaded — treat
          depths cautiously.
        </p>
        <p className="help__row">
          <strong>Split / AIS / Chart</strong> switch views: vessel list beside the chart, list
          only, or chart only.
        </p>
        <p className="help__row">
          The <strong>▴ chevron</strong> hides the buttons row to give the chart more room — or
          swipe up on the bar. Tap ▾ (or swipe down) to bring them back. Your position, speed, and
          heading always stay.
        </p>
        <p className="help__row">
          <strong>Position / speed / heading</strong> come from GPS. Heading is the direction you're
          moving over the ground — when stopped or drifting it can wander; that's normal for GPS.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Your boat on the chart</h3>
        <p className="help__row">
          <span className="help__swatch help__swatch--ownship" aria-hidden="true" />
          The orange triangle is you. It points the way you're moving, the line ahead shows where
          you'll be soon, and the glowing ring pulses so you can find yourself at a glance.
        </p>
        <p className="help__row">
          With the compass enabled (one-time "Enable compass" tap), the triangle also follows which
          way the phone points while you're stopped or drifting — underway, GPS course takes over
          because it's truer on a moving boat.
        </p>
        <p className="help__row">
          The chart follows your boat until you pan or zoom away. Tap the recenter button to snap
          back to following.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">The vessel list (AIS)</h3>
        <p className="help__row">
          Boats broadcasting AIS appear as cards, worst-first: anything flagged{' '}
          <strong>DANGER</strong> (red bar — very close, or close and closing fast) sorts to the
          top, then <strong>CAUTION</strong> (amber bar — closing within the next several minutes),
          then everything else by distance. Each card reads in plain words: where the boat is
          relative to your bow/stern/port/starboard, and what it's doing.
        </p>
        <p className="help__row">
          A dimmed card means the boat hasn't been heard from in a while — its position is old.
          <strong> Active only</strong> hides stale and positionless targets.
        </p>
        <p className="help__row">
          Tap any card (or any boat on the chart) for details — including a ready-to-read{' '}
          <strong>VHF radio script</strong> for hailing that boat, with your position described from
          their point of view.
        </p>
        <p className="help__row">
          Real AIS is messy: boats with no name show their MMSI number, and missing data shows as
          missing rather than guessed. A boat that isn't broadcasting AIS will never appear — most
          small boats don't. The list is help, not a substitute for looking out the window.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Seeing more boats: the shore relay</h3>
        <p className="help__row">
          The phone has no AIS receiver, so the app can relay what volunteer{' '}
          <strong>shore stations</strong> hear, over the internet (aisstream.io). To turn it on:
          create a free account at aisstream.io (it signs in with a GitHub account, also free), copy
          your API key, and paste it into Settings under "Internet AIS" with the checkbox on. Needs
          cellular data.
        </p>
        <p className="help__row">
          Relayed boats are labeled <strong>"via shore relay"</strong> and never raise
          danger/caution flags — their positions can be minutes old, so treat them as awareness,
          not collision avoidance. A strip above the list shows the relay's state:{' '}
          <strong>receiving</strong> (working), <strong>connecting</strong>,{' '}
          <strong>offline</strong> (no signal — an empty list may not mean no traffic), or{' '}
          <strong>refused</strong> (the API key is wrong — re-copy it in Settings).
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Reading the chart</h3>
        <p className="help__row">
          <span className="help__swatch help__swatch--shallow" aria-hidden="true" />
          Red lines: less than 6 ft of water <strong>right now</strong>. Yellow: 6–20 ft. Green: 20
          ft or more. The colors already account for the tide, so red means shallow at this moment —
          no mental math. Spots that dry out completely at low tide stay red all day.
        </p>
        <p className="help__row">
          The small numbers are water depth in feet at that exact spot, <strong>right now</strong> —
          they already include the tide and update as it changes. Tap one for details.
        </p>
        <p className="help__row">
          Tap any open water for a depth story: "About 12 ft here now · Charted 4 ft at low water +
          8 ft of tide." Buoys and lights appear as their real chart symbols — tap them for a
          plain-English description.
        </p>
        <p className="help__row">
          On a phone, the color/symbol key hides behind the <strong>KEY</strong> button at the
          bottom-left of the chart — tap to show it, tap again to put it away.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Chart buttons (right edge)</h3>
        <p className="help__row">
          <span className="help__icon" aria-hidden="true">
            +
          </span>
          / <span className="help__icon">−</span> Zoom in and out. Pinching works too.
        </p>
        <p className="help__row">
          <span className="help__icon" aria-hidden="true">
            <Icon name="recenter" size={20} />
          </span>
          Recenter — snaps the chart back to following your boat after you've panned away.
        </p>
        <p className="help__row">
          <span className="help__icon" aria-hidden="true">
            <Icon name="layers" size={20} />
          </span>
          Chart layers — show or hide buoys, depth numbers, your track line, and other detail.
        </p>
        <p className="help__row">
          <span className="help__icon" aria-hidden="true">
            <Icon name="pin" size={20} />
          </span>
          Drop pin — tap this, then tap the chart to set a destination. Tap more spots to build a
          route; hit Done when finished.
        </p>
        <p className="help__row">
          <span className="help__icon" aria-hidden="true">
            <Icon name="star" size={20} />
          </span>
          Save a spot — tap this, then tap the chart to save a place (mooring, anchorage, hazard, or
          point of interest).
        </p>
        <p className="help__row">
          <span className="help__icon" aria-hidden="true">
            <Icon name="anchor" size={20} />
          </span>
          Anchor watch — see the Anchor watch section below.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Destination, routes, and getting home</h3>
        <p className="help__row">
          With a destination set (drop pin, or tap a saved spot → Go here), the chart shows the leg
          and a widget with distance and arrival time, using your cruising speed from Settings —
          auto-detected from GPS if you leave it blank.
        </p>
        <p className="help__row">
          A route with thin water gets a warning pill: the app checks charted depth plus tide along
          the way against your draft and safety margin, and tells you where and when it gets tight.
        </p>
        <p className="help__row">
          <strong>Safe return</strong>: with a home mooring set in Settings, a pill warns when
          daylight or weather argue for heading back — tap it for the story.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Saved spots ( ⋮ button )</h3>
        <p className="help__row">
          <span className="help__icon" aria-hidden="true">
            <Icon name="more" size={20} />
          </span>
          The three-dot button opens your saved spots and routes: rename, delete, or set one as
          your destination. The ship's log lives here too. The app also quietly suggests spots
          where you linger (a favorite gunkhole gets remembered).
        </p>
        <p className="help__row">
          <span className="help__icon" aria-hidden="true">
            <Icon name="star" size={20} />
          </span>
          Point of interest ·{' '}
          <span className="help__icon" aria-hidden="true">
            <Icon name="anchor" size={20} />
          </span>
          Anchorage ·{' '}
          <span className="help__icon" aria-hidden="true">
            <Icon name="mooringBuoy" size={20} />
          </span>
          Mooring ·{' '}
          <span className="help__icon help__icon--hazard" aria-hidden="true">
            <Icon name="hazard" size={20} />
          </span>
          Hazard
        </p>
        <p className="help__row">
          Hazards are special: they show up in the AIS list when you're near one, and an alarm fires
          if you're headed at one within 200 meters.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Track line and ship's log</h3>
        <p className="help__row">
          The app records where you've been. The dotted orange line on the chart is today's track
          (turn it on/off in Chart layers). The <strong>ship's log</strong> — in the saved-spots
          panel — writes the day up for you: "Departed Castine mooring 9:12 AM · Distance run 14.2
          nautical miles." Anchor drops, MOB events, and saved spots get logged automatically. Share
          a day's entry from the panel.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Tides and how deep the water really is</h3>
        <p className="help__row">
          Paper charts (and this app's chart) measure depth at a <strong>typical low tide</strong> —
          the cautious baseline. The real water is usually deeper: charted depth plus however much
          tide is in. The app does that addition for you everywhere a depth appears.
        </p>
        <p className="help__row">
          Careful: a few times a month the tide drops <strong>below</strong> the charted low — a
          "minus tide." A spot charted at 4 ft can briefly hold only 3. The app's warnings account
          for this.
        </p>
        <p className="help__row">
          Set your boat's draft (how deep it sits) in Settings. Warnings fire when the water gets
          close to draft plus a safety cushion — so "Shallow water on route" means "your boat,
          specifically, may not fit through there right now."
        </p>
        <p className="help__row">
          While anchored with a depth entered, the app watches the falling tide and warns you hours
          ahead if the water will get too shallow under you — with the time it happens.
        </p>
        <p className="help__row">
          Tide times and heights are official NOAA predictions for the nearest station, stored on
          the device — they work with no signal. If they're ever unavailable, depths fall back to
          the cautious low-tide numbers, a ~ appears, and timed warnings pause rather than guess.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">MOB — man overboard</h3>
        <p className="help__row">
          The red MOB button (top right) marks the exact spot someone went in. It asks once to
          confirm, then drops a marker, sets it as your destination, switches to the chart, and
          raises the alarm banner. Tap "MOB ACTIVE — CLEAR" when the person is recovered. Keyboard:
          type M-O-B.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Anchor watch</h3>
        <p className="help__row">
          Anchored for the night? Tap the anchor button and Drop. If the boat drifts outside your
          chosen circle, the alarm banner flashes and (if audio is on) the phone sounds off. Use
          "Test alarm sound" when setting it so you know what to listen for.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Alarms</h3>
        <p className="help__row">
          One alarm shows at a time — the banner across the top with the flashing border. Four
          things can raise it: anchor drag, man overboard, an anchorage going too shallow, and
          heading at a hazard spot. <strong>Acknowledge</strong> silences the noise but keeps the
          condition tracked; the alarm only truly clears when the cause does (or you clear MOB /
          stop the watch).
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Weather</h3>
        <p className="help__row">
          The weather pill on the chart is a go/no-go read of the official NOAA forecast against
          your limits (max wind and wave height, set in Settings). Tap it for the details. Needs
          cell signal to refresh; it shows the last fetched forecast with its age when offline.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Day and night colors</h3>
        <p className="help__row">
          The sun/moon button switches the night palette — dim, red-shifted colors that protect
          night vision. On auto, it flips by itself at dusk and dawn.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Working offline</h3>
        <p className="help__row">
          The app is built to work with <strong>no signal</strong>: charts are stored on the phone
          (the one-time "Download charts" banner), tides are stored for the year, and GPS needs no
          network. Only three things want data: the weather forecast, the shore relay, and the
          yearly tide refresh — all degrade gracefully without it.
        </p>
        <p className="help__row">
          Getting it on a phone: open the site in Safari → Share → <strong>Add to Home Screen</strong>.
          It runs full-screen like a regular app, and updates itself when opened with signal.
        </p>
      </section>

      <div className="settings-form__buttons">
        <button type="button" className="action-sheet__btn" onClick={onBack}>
          {backLabel}
        </button>
      </div>
    </div>
  );
}
