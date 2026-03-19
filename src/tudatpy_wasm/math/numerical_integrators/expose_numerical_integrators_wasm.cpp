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
#include "../../shared_ptr_wasm.h"

#include <tudat/math/integrators/createNumericalIntegrator.h>
#include <tudat/math/integrators/rungeKuttaCoefficients.h>

namespace tni = tudat::numerical_integrators;

WASM_MODULE_PATH("math_numerical_integrators")

EMSCRIPTEN_BINDINGS(tudatpy_math_numerical_integrators) {
    using namespace emscripten;

    // NOTE: AvailableIntegrators enum is registered in
    // dynamics/propagation_setup/integrator/expose_integrator_wasm.cpp
    // Do not register here to avoid "Cannot register type twice" errors.
    // enum_<tni::AvailableIntegrators>(...)

    // NOTE: CoefficientSets enum is registered in
    // dynamics/propagation_setup/integrator/expose_integrator_wasm.cpp
    // Do not register here to avoid "Cannot register type twice" errors.
    // enum_<tni::CoefficientSets>(...)

    // NOTE: IntegratorSettings base class is registered in
    // dynamics/propagation_setup/integrator/expose_integrator_wasm.cpp
    // Do not register here to avoid "Cannot register type twice" errors.
    // class_<tni::IntegratorSettings<double>>(...)

    // RungeKuttaVariableStepSizeSettings derived class
    // NOTE: Not duplicated - only registered here.
    class_<tni::RungeKuttaVariableStepSizeSettings<double>,
           base<tni::IntegratorSettings<double>>>(
        "math_numerical_integrators_RungeKuttaVariableStepSizeSettings")
        .smart_ptr<std::shared_ptr<tni::RungeKuttaVariableStepSizeSettings<double>>>(
            "shared_ptr_RungeKuttaVariableStepSizeSettings");

    // NOTE: BulirschStoerIntegratorSettings is registered in
    // dynamics/propagation_setup/integrator/expose_integrator_wasm.cpp
    // Do not register here to avoid "Cannot register type twice" errors.
    // class_<tni::BulirschStoerIntegratorSettings<double>>(...)

    // NOTE: AdamsBashforthMoultonSettings is registered in
    // dynamics/propagation_setup/integrator/expose_integrator_wasm.cpp
    // Do not register here to avoid "Cannot register type twice" errors.
    // class_<tni::AdamsBashforthMoultonSettings<double>>(...);
}

#endif
