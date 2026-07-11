// Plain-language guide to every icon and control — lives inside the
// Settings panel (no extra StatusBar button; screen space is tight on the
// phone). Content only; no state beyond the Back action.

import { Icon } from '../icons';

export function HelpContent({ onBack }: { onBack: () => void }) {
  return (
    <div className="settings-form help">
      <h2 id="settings-title" className="settings-form__title">
        How to use this app
      </h2>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Your boat</h3>
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
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Reading the chart</h3>
        <p className="help__row">
          <span className="help__swatch help__swatch--shallow" aria-hidden="true" />
          Red lines: less than 10 ft of water. Yellow: 10–24 ft. Green: 24 ft or more.
        </p>
        <p className="help__row">
          The small numbers are water depth in feet at that exact spot, <strong>right now</strong> —
          they already include the tide and update as it changes. Tap one for details.
        </p>
        <p className="help__row">
          Buoys and lights appear as their real chart symbols. Tap any of them for a plain-English
          description.
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
          Chart layers — show or hide buoys, depth numbers, and other detail.
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
        <h3 className="settings-form__section-title">Saved-spot icons</h3>
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
          "Test alarm sound" when setting it so you know what to listen for. Acknowledge silences a
          real alarm without stopping the watch.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Top-bar signals</h3>
        <p className="help__row">
          <strong>GPS OK / GPS stale / no fix</strong> — green means a live position; amber means
          the fix is old; red means no position yet.
        </p>
        <p className="help__row">
          The tide entry shows the nearest station, and the next high or low. A ~ or "estimated"
          means live NOAA data isn't available — treat depths cautiously.
        </p>
        <p className="help__row">
          <strong>Split / AIS / Chart</strong> switch between the combined view, the vessel list,
          and the full chart.
        </p>
      </section>

      <div className="settings-form__buttons">
        <button type="button" className="action-sheet__btn" onClick={onBack}>
          Back to settings
        </button>
      </div>
    </div>
  );
}
