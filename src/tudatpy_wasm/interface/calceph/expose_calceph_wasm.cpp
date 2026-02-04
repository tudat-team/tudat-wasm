/*    Copyright (c) 2010-2025, Delft University of Technology
 *    All rights reserved
 *
 *    This file is part of the Tudat. Redistribution and use in source and
 *    binary forms, with or without modification, are permitted exclusively
 *    under the terms of the Modified BSD license. You should have received
 *    a copy of the license with this file. If not, please or visit:
 *    http://tudat.tudelft.nl/LICENSE.
 *
 *    WASM bindings for CALCEPH-based ephemeris functionality.
 *    These bindings expose the CalcephEphemerisManager singleton for
 *    loading binary SPK files and querying body states in the browser.
 */

#ifdef __EMSCRIPTEN__
#ifdef TUDAT_BUILD_WITH_CALCEPH

#include <emscripten/bind.h>
#include "../../wasm_module.h"
#include "../../eigen_wasm.h"
#include "../../stl_wasm.h"

#include <tudat/astro/ephemerides/calcephEphemeris.h>

namespace te = tudat::ephemerides;

WASM_MODULE_PATH("interface_calceph")

// Wrapper functions to access the singleton and convert types as needed

/**
 * Load an SPK file for the specified target/observer pair.
 * @param spkPath Path to the SPK file in the virtual filesystem
 * @param target Name of the target body (e.g., "Earth", "Mars")
 * @param observer Name of the observer body (e.g., "Sun", "SSB")
 * @param frame Reference frame (default "J2000")
 * @return true if loaded successfully
 */
bool calceph_load_spk(const std::string& spkPath, const std::string& target,
                      const std::string& observer, const std::string& frame)
{
    return te::CalcephEphemerisManager::getInstance().loadSpkFile(spkPath, target, observer, frame);
}

/**
 * Load an SPK file using NAIF IDs directly.
 * @param spkPath Path to the SPK file
 * @param targetId NAIF ID of target body (e.g., 399 for Earth)
 * @param observerId NAIF ID of observer body (e.g., 10 for Sun)
 * @param frame Reference frame
 * @return true if loaded successfully
 */
bool calceph_load_spk_by_naif_id(const std::string& spkPath, int targetId,
                                  int observerId, const std::string& frame)
{
    return te::CalcephEphemerisManager::getInstance().loadSpkFileByNaifId(spkPath, targetId, observerId, frame);
}

/**
 * Check if ephemeris is available for a target/observer pair.
 */
bool calceph_is_available(const std::string& target, const std::string& observer,
                          const std::string& frame)
{
    return te::CalcephEphemerisManager::getInstance().isAvailable(target, observer, frame);
}

/**
 * Get state of target relative to observer at given epoch.
 * @param target Name of target body
 * @param observer Name of observer body
 * @param frame Reference frame
 * @param secondsSinceJ2000 Epoch in seconds since J2000 (TDB)
 * @return Cartesian state [x, y, z, vx, vy, vz] in m and m/s
 */
tudatpy_wasm::Vector6dWrapper calceph_get_state(const std::string& target, const std::string& observer,
                                   const std::string& frame, double secondsSinceJ2000)
{
    Eigen::Vector6d state = te::CalcephEphemerisManager::getInstance().getState(target, observer, frame, secondsSinceJ2000);
    return tudatpy_wasm::Vector6dWrapper(state);
}

/**
 * Get time bounds for a target/observer pair.
 * @return Pair of (startEpoch, endEpoch) in seconds since J2000
 */
std::vector<double> calceph_get_time_bounds(const std::string& target, const std::string& observer,
                                             const std::string& frame)
{
    auto bounds = te::CalcephEphemerisManager::getInstance().getTimeBounds(target, observer, frame);
    return {bounds.first, bounds.second};
}

/**
 * List all loaded ephemeris keys.
 * Each key is in format "target_observer_frame".
 */
std::vector<std::string> calceph_list_loaded()
{
    return te::CalcephEphemerisManager::getInstance().listLoaded();
}

/**
 * Clear all loaded ephemeris files.
 */
void calceph_clear_all()
{
    te::CalcephEphemerisManager::getInstance().clearAll();
}

/**
 * Convert body name to NAIF ID.
 * @param name Body name (e.g., "Earth", "Mars", "Sun")
 * @return NAIF ID (e.g., 399 for Earth, 10 for Sun)
 */
int calceph_body_name_to_naif_id(const std::string& name)
{
    return te::CalcephEphemerisManager::bodyNameToNaifId(name);
}

/**
 * Convert NAIF ID to body name.
 * @param naifId NAIF ID
 * @return Body name
 */
std::string calceph_naif_id_to_body_name(int naifId)
{
    return te::CalcephEphemerisManager::naifIdToBodyName(naifId);
}

// Simple test function to verify bindings are working
bool calceph_test_available()
{
    return true;
}

EMSCRIPTEN_BINDINGS(tudatpy_interface_calceph) {
    using namespace emscripten;

    // Simple test function first
    function("calceph_test_available", &calceph_test_available);

    // Main CALCEPH functions - named to match JavaScript expectations
    function("calceph_load_spk", &calceph_load_spk);
    function("calceph_load_spk_by_naif_id", &calceph_load_spk_by_naif_id);
    function("calceph_is_available", &calceph_is_available);
    function("calceph_get_state", &calceph_get_state);
    function("calceph_get_time_bounds", &calceph_get_time_bounds);
    function("calceph_list_loaded", &calceph_list_loaded);
    function("calceph_clear_all", &calceph_clear_all);
    function("calceph_body_name_to_naif_id", &calceph_body_name_to_naif_id);
    function("calceph_naif_id_to_body_name", &calceph_naif_id_to_body_name);
}

#endif  // TUDAT_BUILD_WITH_CALCEPH
#endif  // __EMSCRIPTEN__
