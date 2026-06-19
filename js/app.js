/**
 * Narrative Controller (Intersection Observer Interface)
 * Xochi Road Closure Scrollytelling Site
 */

document.addEventListener("DOMContentLoaded", () => {
    const steps = document.querySelectorAll(".step");

    // Configure Intersection Observer
    // A step is considered "active" when it occupies the middle focal zone of the screen.
    const observerOptions = {
        root: null, // relative to the viewport
        rootMargin: "-25% 0px -35% 0px", // triggers when card is in the center-ish portion of screen
        threshold: 0.15 // trigger as soon as a tiny part enters this region
    };

    // Keep track of the last active step to avoid duplicate event dispatches
    let lastActiveStepIndex = -1;

    const stepObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            // Check if step card is intersecting our focal region
            if (entry.isIntersecting) {
                const targetStep = entry.target;
                const stepIndex = parseInt(targetStep.getAttribute("data-step"));
                const clusterKey = targetStep.getAttribute("data-cluster");

                if (stepIndex !== lastActiveStepIndex) {
                    lastActiveStepIndex = stepIndex;

                    // 1. Manage Active Class in HTML cards for transition effects
                    steps.forEach(s => s.classList.remove("active"));
                    targetStep.classList.add("active");

                    // 2. Dispatch the update to the D3 Canvas Engine
                    if (typeof setVisualState === "function") {
                        setVisualState(stepIndex, clusterKey);
                    }
                    
                    // 3. Update Legend text dynamically to assist navigation
                    updateLegendForStep(stepIndex);
                }
            }
        });
    }, observerOptions);

    // Register all step sections
    steps.forEach(step => stepObserver.observe(step));

    // Dynamic Legend description update helper
    function updateLegendForStep(index) {
        const zoomHint = document.querySelector("#zoom-hint");
        if (!zoomHint) return;

        const hints = {
            0: "Desplázate hacia abajo para ver el desglose",
            1: "Rojo: Cuentas inorgánicas coordinadas | Azul: Cuentas orgánicas",
            2: "Enfoque: Clúster de Pactos y Corrupción",
            3: "Enfoque: Clúster de Ineficiencia Técnica",
            4: "Enfoque: Clúster de Decepción Política",
            5: "Enfoque: Clúster de Gestión Municipal",
            6: "Enfoque: Debate sobre movilidad urbana e infraestructura",
            7: "Muestra de perfiles inorgánicos con anomalías topológicas",
            8: "Top 20 perfiles más centrales del debate"
        };

        if (hints[index] !== undefined) {
            zoomHint.innerText = hints[index];
        }
    }
});
