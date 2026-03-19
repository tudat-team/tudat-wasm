/*    Copyright (c) 2010-2025, Delft University of Technology
 *    All rights reserved
 *
 *    This file is part of the Tudat. Redistribution and use in source and
 *    binary forms, with or without modification, are permitted exclusively
 *    under the terms of the Modified BSD license. You should have received
 *    a copy of the license with this file. If not, please or visit:
 *    http://tudat.tudelft.nl/LICENSE.
 */

#ifdef __EMSCRIPTEN__

#include <emscripten/bind.h>
#include "../../wasm_module.h"
#include "../../stl_wasm.h"
#include "../../shared_ptr_wasm.h"
#include "../../eigen_wasm.h"

#include <tudat/simulation/propagation_setup/createAccelerationModels.h>
#include <tudat/simulation/propagation_setup/createTorqueModel.h>
#include <tudat/simulation/propagation_setup/createMassRateModels.h>
#include <tudat/simulation/propagation_setup/propagationSettings.h>
#include <tudat/simulation/propagation_setup/dynamicsSimulator.h>
#include <tudat/simulation/estimation_setup/createNumericalSimulator.h>
#include <tudat/math/integrators/createNumericalIntegrator.h>

using tudatpy_wasm::VectorXdWrapper;

namespace tss = tudat::simulation_setup;
namespace tba = tudat::basic_astrodynamics;
namespace tp = tudat::propagators;
namespace tni = tudat::numerical_integrators;

// ============================================================================
// JS-friendly wrapper: build SelectedAccelerationMap from flat list
// ============================================================================

/**
 * AccelerationSettingsBuilder + integrated propagation runner.
 *
 * Since AccelerationMap uses deeply nested unordered_maps that can't be
 * registered with Embind, this class encapsulates the entire pipeline:
 * build acceleration settings -> create acceleration models -> create
 * propagator -> run simulator.
 *
 * Usage from JS:
 *   const builder = new tudat.AccelerationSettingsBuilder();
 *   builder.add("Satellite", "Earth", tudat.dynamics_propagation_setup_acceleration_spherical_harmonic_gravity(8, 8));
 *   builder.add("Satellite", "Sun", tudat.dynamics_propagation_setup_acceleration_point_mass_gravity());
 *   const sim = builder.propagate(bodies, ["Satellite"], ["Earth"], initState, 0.0, integrator, termination, cowell);
 */
class AccelerationSettingsBuilder {
public:
    void add(const std::string& bodyUndergoing,
             const std::string& bodyExerting,
             std::shared_ptr<tss::AccelerationSettings> settings)
    {
        selectedMap_[bodyUndergoing][bodyExerting].push_back(settings);
    }

    /**
     * Build acceleration models, create propagator settings, and run the simulation.
     * Returns the SingleArcDynamicsSimulator for result extraction.
     */
    std::shared_ptr<tp::SingleArcDynamicsSimulator<double, double>> propagate(
        const tss::SystemOfBodies& bodies,
        const std::vector<std::string>& bodiesToPropagate,
        const std::vector<std::string>& centralBodies,
        const VectorXdWrapper& initialStatesWrapped,
        double initialTime,
        std::shared_ptr<tni::IntegratorSettings<double>> integratorSettings,
        std::shared_ptr<tp::PropagationTerminationSettings> terminationSettings,
        tp::TranslationalPropagatorType propagatorType) const
    {
        // Create acceleration models from the accumulated settings
        tba::AccelerationMap accelModels = tss::createAccelerationModelsMap(
            bodies, selectedMap_, bodiesToPropagate, centralBodies);

        // Create propagator settings
        auto propagatorSettings = tp::translationalStatePropagatorSettings<double, double>(
            centralBodies, accelModels, bodiesToPropagate,
            initialStatesWrapped.data, initialTime, integratorSettings, terminationSettings, propagatorType);

        propagatorSettings->getOutputSettings()->setIntegratedResult(true);

        // Run the simulation
        return std::make_shared<tp::SingleArcDynamicsSimulator<double, double>>(
            bodies, propagatorSettings);
    }

private:
    tss::SelectedAccelerationMap selectedMap_;
};

WASM_MODULE_PATH("dynamics_propagation_setup")

EMSCRIPTEN_BINDINGS(tudatpy_dynamics_propagation_setup) {
    using namespace emscripten;

    // ========================================================================
    // STL type registrations for acceleration settings
    // ========================================================================
    register_vector<std::shared_ptr<tss::AccelerationSettings>>("VectorAccelerationSettings");

    // ========================================================================
    // AccelerationSettingsBuilder - JS-friendly interface
    // Encapsulates the entire accel settings -> model creation -> propagation
    // pipeline, avoiding the need to register deeply nested AccelerationMap types.
    // ========================================================================
    class_<AccelerationSettingsBuilder>("AccelerationSettingsBuilder")
        .constructor<>()
        .function("add", &AccelerationSettingsBuilder::add)
        .function("propagate", &AccelerationSettingsBuilder::propagate);

    // Factory function to create torque models
    function("dynamics_propagation_setup_create_torque_models",
        &tss::createTorqueModelsMap);

    // Factory function to create mass rate models
    function("dynamics_propagation_setup_create_mass_rate_models",
        &tss::createMassRateModelsMap);
}

#endif
