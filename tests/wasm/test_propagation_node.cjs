/**
 * Node.js Orbit Propagation Test - SingleArcDynamicsSimulator
 *
 * High-fidelity numerical propagation using:
 *  - SPICE ephemerides (DE430 binary kernels via NODERAWFS)
 *  - Spherical harmonic gravity (GOCO05c or EGM96)
 *  - Sun third-body perturbation
 *  - RK4 fixed-step integrator
 *
 * Run: TUDAT_DATA=<path> node tests/wasm/test_propagation_node.js
 */

const fs = require('fs');
const path = require('path');

// Paths
const NODE_MODULE = path.join(__dirname, '../../build-wasm/src/tudatpy_wasm/tudatpy_wasm_node.js');
const DATA_DIR = path.join(__dirname, 'data');

// Verify prerequisites
if (!fs.existsSync(NODE_MODULE)) {
    console.error('ERROR: Node WASM module not found. Build with: cmake --build build-wasm --target tudatpy_wasm_node');
    process.exit(1);
}

// Set TUDAT_DATA env for resource path
process.env.TUDAT_DATA = DATA_DIR;

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, name, actual, expected) {
    if (condition) {
        console.log(`  ✓ ${name}`);
        testsPassed++;
    } else {
        console.log(`  ✗ ${name}`);
        if (expected !== undefined) console.log(`    Expected: ${expected}, Got: ${actual}`);
        testsFailed++;
    }
}

function assertApprox(actual, expected, tol, name) {
    const diff = Math.abs(actual - expected);
    assert(diff < tol, name, actual, `${expected} ± ${tol}`);
}

// ============================================================================
// Test: Two-body point-mass propagation (no SPICE needed)
// ============================================================================
async function testTwoBodyPropagation(tudat) {
    console.log('\n=== Two-Body Point-Mass Propagation (no SPICE) ===');

    // Constants
    const earthGM = 3.986004418e14;  // m^3/s^2
    const sma = 7000e3;              // 7000 km semi-major axis
    const orbitalPeriod = 2 * Math.PI * Math.sqrt(Math.pow(sma, 3) / earthGM);

    console.log(`  Orbital period: ${(orbitalPeriod / 60).toFixed(1)} minutes`);

    // Create body settings using SPICE (kernels loaded at startup)
    const bodyNames = new tudat.VectorString();
    bodyNames.push_back('Earth');

    const bodySettings = tudat.dynamics_environment_setup_get_default_body_settings(
        bodyNames, 'Earth', 'J2000');

    // Create system of bodies
    const bodies = tudat.dynamics_environment_setup_create_system_of_bodies(bodySettings);
    assert(bodies !== null, 'SystemOfBodies created');

    // Add satellite body
    bodies.createEmptyBody('Satellite');

    // Define initial state (circular LEO in equatorial plane)
    const keplerState = new tudat.Vector6d();
    keplerState.set(0, sma);    // semi-major axis
    keplerState.set(1, 0.001);  // small eccentricity
    keplerState.set(2, Math.PI / 4);  // 45° inclination
    keplerState.set(3, 0.0);    // argument of periapsis
    keplerState.set(4, 0.0);    // RAAN
    keplerState.set(5, 0.0);    // true anomaly

    const initialState = tudat.astro_element_conversion_keplerian_to_cartesian(
        keplerState, earthGM);

    console.log(`  Initial position: [${initialState.get(0).toExponential(4)}, ${initialState.get(1).toExponential(4)}, ${initialState.get(2).toExponential(4)}] m`);
    console.log(`  Initial velocity: [${initialState.get(3).toExponential(4)}, ${initialState.get(4).toExponential(4)}, ${initialState.get(5).toExponential(4)}] m/s`);

    // Build acceleration settings
    const accelBuilder = new tudat.AccelerationSettingsBuilder();
    accelBuilder.add('Satellite', 'Earth',
        tudat.dynamics_propagation_setup_acceleration_point_mass_gravity());

    // Create acceleration models
    const bodiesToProp = new tudat.VectorString();
    bodiesToProp.push_back('Satellite');
    const centralBodies = new tudat.VectorString();
    centralBodies.push_back('Earth');

    // Integrator: RK4, 30s step
    const integrator = tudat.dynamics_propagation_setup_integrator_runge_kutta_4(30.0, false);
    assert(integrator !== null, 'RK4 integrator created');

    // Termination: propagate for one orbit
    const termination = tudat.dynamics_propagation_setup_propagator_time_termination(
        0.0 + orbitalPeriod, false);

    // Convert initial state to VectorXd for propagator
    const initStateXd = new tudat.VectorXd();
    initStateXd.resize(6);
    for (let i = 0; i < 6; i++) initStateXd.set(i, initialState.get(i));

    // Run propagation via builder (handles AccelerationMap internally)
    console.log('  Running propagation...');
    const startTime = Date.now();

    const simulator = accelBuilder.propagate(
        bodies, bodiesToProp, centralBodies,
        initStateXd, 0.0, integrator, termination,
        tudat.dynamics_propagation_setup_propagator_TranslationalPropagatorType.cowell);

    const elapsed = Date.now() - startTime;
    console.log(`  Propagation completed in ${elapsed} ms`);

    assert(simulator.integrationCompletedSuccessfully(), 'Integration completed successfully');

    // Get results
    const stateHistory = simulator.getEquationsOfMotionNumericalSolution();
    const keys = stateHistory.keys();
    const numSteps = keys.size();

    console.log(`  Number of steps: ${numSteps}`);
    assert(numSteps > 50, `Enough propagation steps (${numSteps} > 50)`);

    // Check final state - for Keplerian orbit the position magnitude should be ~same
    const firstState = stateHistory.get(keys.get(0));
    const lastState = stateHistory.get(keys.get(numSteps - 1));

    const r0 = Math.sqrt(
        Math.pow(firstState.get(0), 2) +
        Math.pow(firstState.get(1), 2) +
        Math.pow(firstState.get(2), 2));
    const rf = Math.sqrt(
        Math.pow(lastState.get(0), 2) +
        Math.pow(lastState.get(1), 2) +
        Math.pow(lastState.get(2), 2));

    console.log(`  Initial radius: ${(r0 / 1e3).toFixed(1)} km`);
    console.log(`  Final radius:   ${(rf / 1e3).toFixed(1)} km`);

    // For near-circular orbit, radius should be similar at start and end
    assertApprox(rf, r0, 50e3, 'Radius at start ≈ radius at end (within 50 km)');

    // Check energy conservation (specific orbital energy = -GM / 2a)
    const v0 = Math.sqrt(
        Math.pow(firstState.get(3), 2) +
        Math.pow(firstState.get(4), 2) +
        Math.pow(firstState.get(5), 2));
    const vf = Math.sqrt(
        Math.pow(lastState.get(3), 2) +
        Math.pow(lastState.get(4), 2) +
        Math.pow(lastState.get(5), 2));

    const E0 = 0.5 * v0 * v0 - earthGM / r0;
    const Ef = 0.5 * vf * vf - earthGM / rf;

    console.log(`  Initial specific energy: ${E0.toExponential(6)} J/kg`);
    console.log(`  Final specific energy:   ${Ef.toExponential(6)} J/kg`);
    console.log(`  Energy drift: ${Math.abs((Ef - E0) / E0 * 100).toExponential(4)}%`);

    assertApprox(Ef, E0, Math.abs(E0) * 1e-6, 'Energy conserved (< 1e-6 relative)');

    // Print a few sample states
    console.log('\n  Sample trajectory (time, x, y, z km):');
    const sampleInterval = Math.floor(numSteps / 5);
    for (let i = 0; i < numSteps; i += sampleInterval) {
        const t = keys.get(i);
        const s = stateHistory.get(t);
        console.log(`    t=${(t / 60).toFixed(0)} min: [${(s.get(0) / 1e3).toFixed(1)}, ${(s.get(1) / 1e3).toFixed(1)}, ${(s.get(2) / 1e3).toFixed(1)}]`);
    }

    // Cleanup
    bodyNames.delete();
    keplerState.delete();
    initialState.delete();
    accelBuilder.delete();
    bodiesToProp.delete();
    centralBodies.delete();
    initStateXd.delete();

    return true;
}

// ============================================================================
// Test: High-fidelity propagation with SH gravity + Sun perturbation
// ============================================================================
async function testHighFidelityPropagation(tudat) {
    console.log('\n=== High-Fidelity Propagation (SH gravity + Sun) ===');

    const earthGM = 3.986004418e14;
    const sma = 7000e3;
    const orbitalPeriod = 2 * Math.PI * Math.sqrt(Math.pow(sma, 3) / earthGM);

    // Create bodies using SPICE (kernels already loaded at startup)
    const bodyNames = new tudat.VectorString();
    bodyNames.push_back('Sun');
    bodyNames.push_back('Earth');

    const bodySettings = tudat.dynamics_environment_setup_get_default_body_settings(
        bodyNames, 'Earth', 'J2000');

    const bodies = tudat.dynamics_environment_setup_create_system_of_bodies(bodySettings);
    bodies.createEmptyBody('Satellite');

    // Initial state: LEO with 45° inclination
    const keplerState = new tudat.Vector6d();
    keplerState.set(0, sma);
    keplerState.set(1, 0.001);
    keplerState.set(2, Math.PI / 4);
    keplerState.set(3, 0.0);
    keplerState.set(4, 0.0);
    keplerState.set(5, 0.0);

    const initialState = tudat.astro_element_conversion_keplerian_to_cartesian(
        keplerState, earthGM);

    // Build accelerations: SH gravity (8x8) + Sun point-mass
    const accelBuilder = new tudat.AccelerationSettingsBuilder();
    accelBuilder.add('Satellite', 'Earth',
        tudat.dynamics_propagation_setup_acceleration_spherical_harmonic_gravity(8, 8));
    accelBuilder.add('Satellite', 'Sun',
        tudat.dynamics_propagation_setup_acceleration_point_mass_gravity());

    const bodiesToProp = new tudat.VectorString();
    bodiesToProp.push_back('Satellite');
    const centralBodies = new tudat.VectorString();
    centralBodies.push_back('Earth');

    // Integrator: RK4, 10s step for accuracy
    const integrator = tudat.dynamics_propagation_setup_integrator_runge_kutta_4(10.0, false);

    // Propagate for one orbit
    const termination = tudat.dynamics_propagation_setup_propagator_time_termination(
        0.0 + orbitalPeriod, false);

    const initStateXd = new tudat.VectorXd();
    initStateXd.resize(6);
    for (let i = 0; i < 6; i++) initStateXd.set(i, initialState.get(i));

    console.log('  Running high-fidelity propagation...');
    const startTime = Date.now();

    const simulator = accelBuilder.propagate(
        bodies, bodiesToProp, centralBodies,
        initStateXd, 0.0, integrator, termination,
        tudat.dynamics_propagation_setup_propagator_TranslationalPropagatorType.cowell);

    const elapsed = Date.now() - startTime;
    console.log(`  Propagation completed in ${elapsed} ms`);

    assert(simulator.integrationCompletedSuccessfully(), 'HiFi integration completed successfully');

    const stateHistory = simulator.getEquationsOfMotionNumericalSolution();
    const keys = stateHistory.keys();
    const numSteps = keys.size();

    console.log(`  Number of steps: ${numSteps}`);
    assert(numSteps > 100, `Enough steps for HiFi (${numSteps} > 100)`);

    // Compute orbit statistics
    const firstState = stateHistory.get(keys.get(0));
    const lastState = stateHistory.get(keys.get(numSteps - 1));

    const r0 = Math.sqrt(
        firstState.get(0) ** 2 + firstState.get(1) ** 2 + firstState.get(2) ** 2);
    const rf = Math.sqrt(
        lastState.get(0) ** 2 + lastState.get(1) ** 2 + lastState.get(2) ** 2);
    const v0 = Math.sqrt(
        firstState.get(3) ** 2 + firstState.get(4) ** 2 + firstState.get(5) ** 2);
    const vf = Math.sqrt(
        lastState.get(3) ** 2 + lastState.get(4) ** 2 + lastState.get(5) ** 2);

    console.log(`  Initial radius: ${(r0 / 1e3).toFixed(3)} km, velocity: ${v0.toFixed(3)} m/s`);
    console.log(`  Final radius:   ${(rf / 1e3).toFixed(3)} km, velocity: ${vf.toFixed(3)} m/s`);

    // With J2 perturbation, orbit is no longer exactly periodic
    // but radius should still be in the right ballpark
    assert(rf > 6371e3, 'Final radius above Earth surface');
    assert(rf < 8000e3, 'Final radius below 8000 km');

    // Position difference between start and end (secular drift from J2)
    const dx = lastState.get(0) - firstState.get(0);
    const dy = lastState.get(1) - firstState.get(1);
    const dz = lastState.get(2) - firstState.get(2);
    const posDrift = Math.sqrt(dx * dx + dy * dy + dz * dz);

    console.log(`  Position drift after 1 orbit: ${(posDrift / 1e3).toFixed(3)} km`);
    console.log(`  (Expected nonzero due to J2 secular perturbation)`);

    // The drift should be noticeable but not huge (a few km for LEO)
    assert(posDrift > 10, 'J2 perturbation produces measurable drift (> 10 m)');
    assert(posDrift < 200e3, 'Drift is physically reasonable (< 200 km)');

    // Print trajectory sample
    console.log('\n  Sample trajectory (time, r_km, v_ms):');
    const sampleInterval = Math.floor(numSteps / 8);
    for (let i = 0; i < numSteps; i += sampleInterval) {
        const t = keys.get(i);
        const s = stateHistory.get(t);
        const r = Math.sqrt(s.get(0) ** 2 + s.get(1) ** 2 + s.get(2) ** 2);
        const v = Math.sqrt(s.get(3) ** 2 + s.get(4) ** 2 + s.get(5) ** 2);
        console.log(`    t=${(t / 60).toFixed(1).padStart(6)} min: r=${(r / 1e3).toFixed(1)} km, v=${v.toFixed(1)} m/s`);
    }

    // Cleanup
    bodyNames.delete();
    keplerState.delete();
    initialState.delete();
    accelBuilder.delete();
    bodiesToProp.delete();
    centralBodies.delete();
    initStateXd.delete();

    return true;
}

// ============================================================================
// Main
// ============================================================================
async function main() {
    console.log('='.repeat(60));
    console.log('  Tudat WASM - Numerical Orbit Propagation Test');
    console.log('='.repeat(60));
    console.log(`  Data dir: ${DATA_DIR}`);

    const createTudatModule = require(NODE_MODULE);
    const tudat = await createTudatModule();

    console.log('  Module loaded successfully');

    // Load all SPICE kernels (text + binary via NODERAWFS)
    const spiceDir = path.join(DATA_DIR, 'spice_kernels');
    const kernels = [
        'naif0012.tls',           // Leapseconds
        'pck00010.tpc',           // Planetary constants (IAU_EARTH etc.)
        'gm_de431.tpc',           // Gravitational parameters
        'de430_mar097_small.bsp', // Binary planetary ephemeris
        'earth_200101_990825_predict.bpc', // Earth orientation (binary)
    ];
    for (const k of kernels) {
        const kpath = path.join(spiceDir, k);
        if (fs.existsSync(kpath)) {
            try {
                tudat.interface_spice_load_kernel(kpath);
                console.log(`  Loaded kernel: ${k}`);
            } catch (e) {
                console.log(`  Warning: Failed to load ${k}: ${e.message}`);
            }
        }
    }
    console.log(`  Total kernels loaded: ${tudat.interface_spice_get_total_count_of_kernels_loaded()}`);

    try {
        await testTwoBodyPropagation(tudat);
    } catch (err) {
        console.error(`\n  ✗ Two-body propagation FAILED: ${err.message}`);
        console.error(err.stack);
        testsFailed++;
    }

    try {
        await testHighFidelityPropagation(tudat);
    } catch (err) {
        console.error(`\n  ✗ High-fidelity propagation FAILED: ${err.message}`);
        console.error(err.stack);
        testsFailed++;
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('  Propagation Test Summary');
    console.log('='.repeat(60));
    console.log(`  Passed: ${testsPassed}`);
    console.log(`  Failed: ${testsFailed}`);
    console.log('='.repeat(60));

    process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
