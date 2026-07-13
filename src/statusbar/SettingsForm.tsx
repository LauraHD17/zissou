// The Settings form — field state + single-submit persistence to the prefs
// stores. The panel shell (button + SlidePanel + Help switch) lives in
// SettingsButton; leaf field components and parsers in settingsFields.

import { useEffect, useRef, useState } from 'react';
import {
  setBoatName,
  setHomeMooring,
  setInternetAis,
  setPropulsion,
  setSafetyMargin,
  setVesselDims,
  setWeatherLimits,
  useUserPrefs,
} from '../prefs/userPrefsStore';
import { useSelf } from '../signalk/useSignalK';
import { validPosition } from '../utils/geometry';
import { computeDetectedCruisingKn, useCruisingSpeedSamples } from '../prefs/cruisingSpeedStore';
import { useSavedFlash } from '../ui/useSavedFlash';
import { DimField, HeadingModePicker } from './settingsFields';
import { numInit, parseLatLon, parseOptional } from './settingsParse';

export function SettingsForm({ onDone, onHelp }: { onDone: () => void; onHelp: () => void }) {
  const prefs = useUserPrefs();
  const self = useSelf();
  const samples = useCruisingSpeedSamples();
  const detectedKn = computeDetectedCruisingKn(samples);
  const cruiseSublabel =
    detectedKn == null
      ? '(Learning)'
      : samples.length < 120
        ? `(Est ${detectedKn.toFixed(1)} kn · ${samples.length} samples)`
        : `(Avg ${detectedKn.toFixed(1)} kn · ${samples.length} samples)`;
  const [name, setName] = useState(prefs.boatName);
  const [loa, setLoa] = useState(numInit(prefs.vessel.loaFt));
  const [beam, setBeam] = useState(numInit(prefs.vessel.beamFt));
  const [draft, setDraft] = useState(numInit(prefs.vessel.draftFt));
  const [safety, setSafety] = useState(numInit(prefs.safetyMarginFt));
  const [cruise, setCruise] = useState(numInit(prefs.propulsion.cruisingSpeedKn));
  const [homeLat, setHomeLat] = useState(numInit(prefs.homeMooring?.latitude));
  const [homeLon, setHomeLon] = useState(numInit(prefs.homeMooring?.longitude));
  const [homeLabel, setHomeLabel] = useState(prefs.homeMooring?.label ?? '');
  const [maxWind, setMaxWind] = useState(numInit(prefs.weatherLimits.maxWindKn));
  const [maxWave, setMaxWave] = useState(numInit(prefs.weatherLimits.maxWaveFt));
  const [netAisEnabled, setNetAisEnabled] = useState(prefs.internetAis.enabled);
  const [netAisKey, setNetAisKey] = useState(prefs.internetAis.apiKey);
  const nameRef = useRef<HTMLInputElement>(null);

  const useCurrentAsHome = () => {
    const pos = validPosition(self);
    if (!pos) return;
    setHomeLat(pos.latitude.toFixed(5));
    setHomeLon(pos.longitude.toFixed(5));
  };

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const savedFlash = useSavedFlash(onDone);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBoatName(name);
    setVesselDims({
      loaFt: parseOptional(loa),
      beamFt: parseOptional(beam),
      draftFt: parseOptional(draft),
    });
    const safetyN = parseOptional(safety);
    if (safetyN != null) setSafetyMargin(safetyN);
    setPropulsion({
      cruisingSpeedKn: parseOptional(cruise),
    });
    const homeLatN = parseLatLon(homeLat, 90);
    const homeLonN = parseLatLon(homeLon, 180);
    if (homeLatN != null && homeLonN != null) {
      setHomeMooring({
        latitude: homeLatN,
        longitude: homeLonN,
        label: homeLabel.trim() || undefined,
      });
    } else if (!homeLat.trim() && !homeLon.trim()) {
      setHomeMooring(undefined);
    }
    setWeatherLimits({
      maxWindKn: parseOptional(maxWind),
      maxWaveFt: parseOptional(maxWave),
    });
    setInternetAis({ enabled: netAisEnabled, apiKey: netAisKey.trim() });
    savedFlash.trigger(); // show "Saved ✓" briefly, then close
  };

  return (
    <form onSubmit={submit} className="settings-form">
      <h2 id="settings-title" className="settings-form__title">
        Settings
      </h2>

      <button type="button" className="settings-form__secondary" onClick={onHelp}>
        Help — what the icons mean & how to use the app
      </button>
      {/* Version pinned at the TOP: when something is broken enough that
          scrolling misbehaves, the user must still be able to read off
          which build they're on without scrolling. */}
      <p className="settings-form__hint settings-form__hint--muted">
        App version: {BUILD_ID ? `build ${BUILD_ID.slice(0, 7)}` : 'development'}
      </p>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Identity</h3>
        <label className="settings-form__field">
          <span>Boat name</span>
          <input
            ref={nameRef}
            type="text"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sisu"
          />
        </label>
        <p className="settings-form__hint">
          Shown on the StatusBar. Leave blank to use the name from SignalK.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Vessel</h3>
        <div className="settings-form__row">
          <DimField
            label="LOA"
            sublabel="(length)"
            unit="ft"
            value={loa}
            onChange={setLoa}
            placeholder="22"
          />
          <DimField
            label="Beam"
            sublabel="(width)"
            unit="ft"
            value={beam}
            onChange={setBeam}
            placeholder="7"
          />
          <DimField
            label="Draft"
            sublabel="(depth)"
            unit="ft"
            value={draft}
            onChange={setDraft}
            placeholder="2.5"
          />
        </div>
        <p className="settings-form__hint">
          Feeds shallow-water warnings and anchor scope. For a centerboard boat (a keel that lifts
          up), enter draft with the board down.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Safety</h3>
        <div className="settings-form__row">
          <DimField
            label="Safety margin"
            sublabel="(below keel)"
            unit="ft"
            value={safety}
            onChange={setSafety}
            placeholder="2"
          />
        </div>
        <p className="settings-form__hint">
          Added to draft when computing safe-water alerts. Two feet is a sensible default for
          coastal cruising.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Cruise speed</h3>
        <div className="settings-form__row">
          <DimField
            label="Override"
            sublabel={cruiseSublabel}
            unit="kn"
            value={cruise}
            onChange={setCruise}
            placeholder={detectedKn != null ? detectedKn.toFixed(1) : '6'}
          />
        </div>
        <p className="settings-form__hint">
          Auto-detected from GPS when you're underway. Leave Override blank to use the detected
          value; fill it in to force a specific speed for ETA and Safe Return calcs.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Home mooring</h3>
        <div className="settings-form__field">
          <span>Label (optional)</span>
          <input
            type="text"
            maxLength={30}
            value={homeLabel}
            onChange={(e) => setHomeLabel(e.target.value)}
            placeholder="Camden Harbor"
          />
        </div>
        <div className="settings-form__row">
          <DimField
            label="Lat"
            sublabel="(−90…90)"
            unit="°"
            value={homeLat}
            onChange={setHomeLat}
            placeholder="44.2100"
          />
          <DimField
            label="Lon"
            sublabel="(−180…180)"
            unit="°"
            value={homeLon}
            onChange={setHomeLon}
            placeholder="-69.0600"
          />
        </div>
        <button type="button" className="settings-form__secondary" onClick={useCurrentAsHome}>
          Use current position
        </button>
        <p className="settings-form__hint">
          Feeds the Safe Return pill — daylight left, time to get home, and the latest departure
          time. Clear both fields to remove.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Weather limits</h3>
        <div className="settings-form__row">
          <DimField
            label="Max wind"
            sublabel="(sustained)"
            unit="kn"
            value={maxWind}
            onChange={setMaxWind}
            placeholder="15"
          />
          <DimField
            label="Max wave"
            sublabel="(sig)"
            unit="ft"
            value={maxWave}
            onChange={setMaxWave}
            placeholder="2"
            disabled
          />
        </div>
        <p className="settings-form__hint settings-form__hint--muted">
          Wind data updates hourly. Wave data is unavailable from this forecast source — "Can I go?"
          currently assesses wind only.
        </p>
        <p className="settings-form__hint">
          Used for "Can I go?" forecast checks. Set to what you and your boat are comfortable with.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Internet AIS (shore relay)</h3>
        <label className="settings-form__field settings-form__field--checkbox">
          <input
            type="checkbox"
            checked={netAisEnabled}
            onChange={(e) => setNetAisEnabled(e.target.checked)}
          />
          <span>Show vessel traffic relayed from shore stations</span>
        </label>
        <label className="settings-form__field">
          <span>aisstream.io API key</span>
          <input
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={netAisKey}
            onChange={(e) => setNetAisKey(e.target.value)}
            placeholder="paste your free key"
          />
        </label>
        <p className="settings-form__hint">
          Needs cellular data and a free key from aisstream.io (create an account, copy the key here
          — it stays on this phone). Relayed positions can be minutes old, so these vessels are
          marked "via shore relay" and never raise collision warnings. Traffic awareness, not
          collision avoidance.
        </p>
      </section>

      <section className="settings-form__section">
        <h3 className="settings-form__section-title">Boat arrow points by</h3>
        <HeadingModePicker />
        <p className="settings-form__hint">
          Auto uses GPS course underway and the compass when you're stopped. Force one source here
          if the automatic handoff ever misbehaves — takes effect immediately, no Save needed.
        </p>
      </section>

      <div className="settings-form__buttons">
        <button type="button" className="action-sheet__btn" onClick={onDone}>
          Cancel
        </button>
        <button
          type="submit"
          className={`action-sheet__btn action-sheet__btn--primary${savedFlash.saved ? ' action-sheet__btn--saved' : ''}`}
        >
          {savedFlash.saved ? 'Saved ✓' : 'Save'}
        </button>
        <span className="sr-only" role="status">
          {savedFlash.saved ? 'Settings saved' : ''}
        </span>
      </div>

      <p className="settings-form__hint settings-form__hint--muted">
        App version: {BUILD_ID ? `build ${BUILD_ID.slice(0, 7)}` : 'development'}. Updates install
        automatically when the app is opened with internet — close and reopen to apply.
      </p>
    </form>
  );
}

// Deploy SHA baked in by the workflow — lets anyone confirm which version an
// installed copy is running (iOS holds onto old PWA code between launches).
const BUILD_ID = (import.meta.env.VITE_BUILD_ID as string | undefined) ?? '';
