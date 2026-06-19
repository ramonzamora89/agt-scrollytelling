/**
 * Network Visualization Engine (D3.js + Canvas 2D)
 * AGT & Aerómetro Scrollytelling Site (Clean light theme matching stable version)
 */

// Canvas & Web API Elements
const canvas = document.querySelector("#network-canvas");
const ctx = canvas.getContext("2d");
const tooltip = document.querySelector("#tooltip");

// State Variables
let width, height;
let networkData = null;
let filteredNodes = [];
let filteredLinks = [];
let currentTransform = d3.zoomIdentity;
let activeStep = 0;
let activeClusterKey = null;

// Node & Link Mappings
let nodesById = new Map();

// Color Schemes (Matches stable reporte_sna_d3.html + graceful narrative highlight)
const COLORS = {
    organic: "#4285F4",    // Organic Blue
    inorganic: "#e74c3c",  // Inorganic Red
    muted: "rgba(100, 116, 139, 0.08)", // Delicate muted slate on white
    mutedLink: "rgba(0, 0, 0, 0.03)",   // Extremely subtle links on white background
    activeLink: "rgba(15, 23, 42, 0.14)", // Darker, elegant slate-colored links for excellent visibility
    highlightLink: "rgba(66, 133, 244, 0.3)" // Clear, delicate blue highlights
};

// Handle Canvas Resize
function resize() {
    width = canvas.parentElement.clientWidth;
    height = canvas.parentElement.clientHeight;
    canvas.width = width;
    canvas.height = height;
    
    if (networkData) {
        draw();
    }
}
window.addEventListener("resize", resize);
resize();

// Load Data and Initialize Simulation
d3.json("visuals/executive_network.json").then(data => {
    networkData = data;
    
    // 1. Filter Nodes for High-Performance:
    // Matches exact stable filter from reporte_sna_d3.html
    filteredNodes = data.nodes.filter(n => n.val > 1 || n.label !== "");
    
    const nodeIds = new Set(filteredNodes.map(d => d.id));
    filteredNodes.forEach(node => {
        nodesById.set(node.id, node);
    });

    // Filter corresponding links
    filteredLinks = data.links.filter(l => 
        (typeof l.source === 'string' ? nodeIds.has(l.source) : nodeIds.has(l.source.id)) && 
        (typeof l.target === 'string' ? nodeIds.has(l.target) : nodeIds.has(l.target.id))
    );

    // 2. Initialize D3 Physics
    // Fine-tuned for spatial expansion:
    // Distance 70 and strong charge repulsion (-140) spread the nodes out,
    // which resetZoom() then scales dynamically to perfectly fill the canvas.
    const simulation = d3.forceSimulation(filteredNodes)
        .force("link", d3.forceLink(filteredLinks).id(d => d.id).distance(70))
        .force("charge", d3.forceManyBody().strength(-140))
        .force("center", d3.forceCenter(width / 2, height / 2));

    // 3. Optimization: Run physical simulation statically
    for (let i = 0; i < 300; i++) {
        simulation.tick();
    }
    simulation.stop(); // Stop physical forces so layouts stay stable during scroll

    // Calculate cluster centers of gravity for smooth zooming
    calculateClusterCenters();

    // 4. Populate HTML Elements
    populateUI();

    // Set initial view centered and scaled
    resetZoom();

    // Setup interactive mouse hover
    setupInteractions();

    // Initial Render
    draw();
}).catch(err => {
    console.error("Error loading network data:", err);
});

// Calculate the average (x, y) center for each narrative cluster
const clusterCenters = {};
function calculateClusterCenters() {
    if (!networkData) return;
    
    Object.keys(networkData.narratives).forEach(key => {
        const narrative = networkData.narratives[key];
        const actorIds = new Set(narrative.top_actors.map(a => a.id));
        
        const matchingNodes = filteredNodes.filter(n => actorIds.has(n.id));
        
        if (matchingNodes.length > 0) {
            const sumX = d3.sum(matchingNodes, n => n.x);
            const sumY = d3.sum(matchingNodes, n => n.y);
            clusterCenters[key] = {
                x: sumX / matchingNodes.length,
                y: sumY / matchingNodes.length
            };
        } else {
            clusterCenters[key] = { x: width / 2, y: height / 2 };
        }
    });

    const aeroNodes = filteredNodes.filter(n => n.aero > 0);
    if (aeroNodes.length > 0) {
        clusterCenters["Aerometro_Only"] = {
            x: d3.sum(aeroNodes, n => n.x) / aeroNodes.length,
            y: d3.sum(aeroNodes, n => n.y) / aeroNodes.length
        };
    } else {
        clusterCenters["Aerometro_Only"] = { x: width / 2, y: height / 2 };
    }
}

// Populate the HTML cards with actor badges and sample bots
function populateUI() {
    if (!networkData) return;

    const botGrid = document.querySelector("#bot-grid");
    if (botGrid) {
        botGrid.innerHTML = ""; // Clear existing
        networkData.stats.all_bots.slice(0, 32).forEach(bot => {
            const badge = document.createElement("span");
            badge.className = "actor-badge inorganic";
            badge.innerText = `@${bot}`;
            botGrid.appendChild(badge);
        });
    }

    const narrativeKeys = {
        Pactos_y_Corrupcion: "#actors-pactos",
        Ineficiencia_Tecnica: "#actors-ineficiencia",
        Decepcion_Politica: "#actors-decepcion",
        Gestion_Municipal: "#actors-gestion"
    };

    Object.keys(narrativeKeys).forEach(key => {
        const container = document.querySelector(narrativeKeys[key]);
        if (container && networkData.narratives[key]) {
            container.innerHTML = ""; // Clear
            networkData.narratives[key].top_actors.forEach(actor => {
                const badge = document.createElement("span");
                badge.className = `actor-badge ${actor.type}`;
                badge.innerText = `@${actor.id}`;
                container.appendChild(badge);
            });
        }
    });
}

// Central Canvas Draw Function (Optimized for White Background)
function draw() {
    if (!networkData) return;
    
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    
    // Apply zoom transforms
    ctx.translate(currentTransform.x, currentTransform.y);
    ctx.scale(currentTransform.k, currentTransform.k);

    // --- STEP 1: DRAW LINKS ---
    filteredLinks.forEach(link => {
        const source = nodesById.get(link.source.id || link.source);
        const target = nodesById.get(link.target.id || link.target);
        
        if (!source || !target) return;

        ctx.beginPath();
        
        if (activeStep === 0 || activeStep === 1) {
            // General view: all links beautifully visible, thin but clear slate color
            ctx.strokeStyle = COLORS.activeLink;
            ctx.lineWidth = 0.6 / Math.sqrt(currentTransform.k);
        } else if (activeStep >= 2 && activeStep <= 5) {
            // Narrative clusters
            const narrative = networkData.narratives[activeClusterKey];
            if (narrative) {
                const actorIds = new Set(narrative.top_actors.map(a => a.id));
                if (actorIds.has(source.id) && actorIds.has(target.id)) {
                    ctx.strokeStyle = COLORS.highlightLink;
                    ctx.lineWidth = 1.0 / Math.sqrt(currentTransform.k);
                } else {
                    ctx.strokeStyle = COLORS.mutedLink;
                    ctx.lineWidth = 0.2 / Math.sqrt(currentTransform.k);
                }
            } else {
                ctx.strokeStyle = COLORS.mutedLink;
                ctx.lineWidth = 0.2 / Math.sqrt(currentTransform.k);
            }
        } else if (activeStep === 6) {
            if (source.aero > 0 && target.aero > 0) {
                ctx.strokeStyle = "rgba(46, 204, 113, 0.35)";
                ctx.lineWidth = 1.0 / Math.sqrt(currentTransform.k);
            } else {
                ctx.strokeStyle = COLORS.mutedLink;
                ctx.lineWidth = 0.2 / Math.sqrt(currentTransform.k);
            }
        } else if (activeStep === 7) {
            if (source.type === 'inorganic' && target.type === 'inorganic') {
                ctx.strokeStyle = "rgba(231, 76, 60, 0.25)";
                ctx.lineWidth = 0.8 / Math.sqrt(currentTransform.k);
            } else {
                ctx.strokeStyle = COLORS.mutedLink;
                ctx.lineWidth = 0.2 / Math.sqrt(currentTransform.k);
            }
        } else if (activeStep === 8) {
            if (source.label || target.label) {
                ctx.strokeStyle = "rgba(66, 133, 244, 0.35)";
                ctx.lineWidth = 0.8 / Math.sqrt(currentTransform.k);
            } else {
                ctx.strokeStyle = COLORS.mutedLink;
                ctx.lineWidth = 0.2 / Math.sqrt(currentTransform.k);
            }
        }

        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
    });

    // --- STEP 2: DRAW NODES (Tiny, starry, extremely delicate node sizes) ---
    filteredNodes.forEach(node => {
        ctx.beginPath();
        
        // Scaled down to 0.65 for a starry look where relations/links are fully visible
        const radius = Math.sqrt(node.val) * 0.65;

        let opacity = 1.0;
        let color = node.type === 'inorganic' ? COLORS.inorganic : COLORS.organic;

        if (activeStep === 0 || activeStep === 1) {
            opacity = 1.0;
        } else if (activeStep >= 2 && activeStep <= 5) {
            const narrative = networkData.narratives[activeClusterKey];
            if (narrative) {
                const actorIds = new Set(narrative.top_actors.map(a => a.id));
                if (actorIds.has(node.id)) {
                    opacity = 1.0;
                    ctx.arc(node.x, node.y, radius + 3, 0, 2 * Math.PI);
                    ctx.fillStyle = "rgba(66, 133, 244, 0.15)";
                    ctx.fill();
                    ctx.beginPath();
                } else {
                    opacity = 0.08; // High fading of other nodes makes the highlighted narrative pop!
                }
            } else {
                opacity = 0.08;
            }
        } else if (activeStep === 6) {
            if (node.aero > 0) {
                opacity = 1.0;
                color = "#2ecc71"; // Positive green
                ctx.arc(node.x, node.y, radius + 3, 0, 2 * Math.PI);
                ctx.fillStyle = "rgba(46, 204, 113, 0.15)";
                ctx.fill();
                ctx.beginPath();
            } else {
                opacity = 0.08;
            }
        } else if (activeStep === 7) {
            if (node.type === 'inorganic') {
                opacity = 1.0;
                color = COLORS.inorganic;
                ctx.arc(node.x, node.y, radius + 2, 0, 2 * Math.PI);
                ctx.fillStyle = "rgba(231, 76, 60, 0.15)";
                ctx.fill();
                ctx.beginPath();
            } else {
                opacity = 0.08;
            }
        } else if (activeStep === 8) {
            if (node.label) {
                opacity = 1.0;
                ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI);
                ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
                ctx.fill();
                ctx.beginPath();
            } else {
                opacity = 0.08;
            }
        }

        ctx.fillStyle = hexToRgba(color, opacity);
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
        ctx.fill();
    });

    // --- STEP 3: DRAW LABELS (Maintained exact labels layout and size) ---
    filteredNodes.forEach(node => {
        if (node.label) {
            let showLabel = false;
            let labelColor = "#2c3e50"; // Dark gray from reporte_sna_d3.html for perfect legibility on white
            let opacity = 1.0;

            if (activeStep === 0 || activeStep === 1) {
                showLabel = currentTransform.k > 0.28;
                opacity = 0.7;
            } else if (activeStep >= 2 && activeStep <= 5) {
                const narrative = networkData.narratives[activeClusterKey];
                if (narrative) {
                    const actorIds = new Set(narrative.top_actors.map(a => a.id));
                    showLabel = actorIds.has(node.id);
                    labelColor = "#1e40af"; // Deep indigo blue for highlighted narrative actors
                }
            } else if (activeStep === 6) {
                showLabel = node.aero > 0;
                labelColor = "#15803d"; // Deep forest green
            } else if (activeStep === 7) {
                showLabel = node.type === 'inorganic' && node.val > 3;
                labelColor = "#991b1b"; // Deep red
            } else if (activeStep === 8) {
                showLabel = true;
                labelColor = node.type === 'inorganic' ? "#991b1b" : "#1e40af";
            }

            if (showLabel) {
                const radius = Math.sqrt(node.val) * 0.65;
                ctx.font = `bold ${10 / Math.sqrt(currentTransform.k) + 8}px 'Poppins', sans-serif`;
                ctx.fillStyle = hexToRgba(labelColor, opacity);
                ctx.fillText(node.label, node.x + radius + 3, node.y + 3);
            }
        }
    });

    ctx.restore();
}

function hexToRgba(hex, alpha) {
    let r = 0, g = 0, b = 0;
    if (hex.startsWith("#")) {
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex.substring(1, 3), 16);
            g = parseInt(hex.substring(3, 5), 16);
            b = parseInt(hex.substring(5, 7), 16);
        }
    } else if (hex.startsWith("rgba")) {
        return hex;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function transitionTo(targetX, targetY, targetScale) {
    const x = width / 2 - targetX * targetScale;
    const y = height / 2 - targetY * targetScale;
    
    const interpolator = d3.interpolate({
        x: currentTransform.x,
        y: currentTransform.y,
        k: currentTransform.k
    }, {
        x: x,
        y: y,
        k: targetScale
    });
    
    d3.transition()
        .duration(1100)
        .ease(d3.easeCubicInOut)
        .tween("zoom", () => {
            return (t) => {
                const current = interpolator(t);
                currentTransform = d3.zoomIdentity.translate(current.x, current.y).scale(current.k);
                draw();
            };
        });
}

// Centering logic that fits the ENTIRE network layout on screen
function resetZoom() {
    if (filteredNodes.length === 0) return;
    
    const minX = d3.min(filteredNodes, d => d.x);
    const maxX = d3.max(filteredNodes, d => d.x);
    const minY = d3.min(filteredNodes, d => d.y);
    const maxY = d3.max(filteredNodes, d => d.y);
    
    // Center of mass (mean) for absolute stable and outlier-free centering on the core network
    const centerX = d3.mean(filteredNodes, d => d.x);
    const centerY = d3.mean(filteredNodes, d => d.y);
    
    // Increased target scale factor bounds (0.93) to make the graph bigger and fill more canvas space
    const scaleX = (width * 0.93) / (maxX - minX);
    const scaleY = (height * 0.93) / (maxY - minY);
    const targetScale = Math.min(scaleX, scaleY, 0.55);

    currentTransform = d3.zoomIdentity
        .translate(width / 2 - centerX * targetScale, height / 2 - centerY * targetScale)
        .scale(targetScale);
}

function setVisualState(stepIndex, clusterKey) {
    activeStep = stepIndex;
    activeClusterKey = clusterKey;
    
    if (!networkData) return;

    if (stepIndex === 0 || stepIndex === 1) {
        resetZoom();
        draw();
    } else if (stepIndex >= 2 && stepIndex <= 5) {
        const center = clusterCenters[clusterKey];
        if (center) {
            // Zoom out narrative view slightly (0.85) to clearly see all key nodes of the cluster
            transitionTo(center.x, center.y, 0.85);
        }
    } else if (stepIndex === 6) {
        const center = clusterCenters["Aerometro_Only"];
        if (center) {
            // Zoom out Aerometro view slightly to see mobility urban network context
            transitionTo(center.x, center.y, 0.95);
        }
    } else if (stepIndex === 7) {
        const inorganicNodes = filteredNodes.filter(n => n.type === 'inorganic');
        if (inorganicNodes.length > 0) {
            const avgX = d3.mean(inorganicNodes, n => n.x);
            const avgY = d3.mean(inorganicNodes, n => n.y);
            transitionTo(avgX, avgY, 0.52);
        } else {
            resetZoom();
            draw();
        }
    } else if (stepIndex === 8) {
        const hubs = filteredNodes.filter(n => n.label !== "");
        if (hubs.length > 0) {
            const avgX = d3.mean(hubs, n => n.x);
            const avgY = d3.mean(hubs, d => d.y);
            transitionTo(avgX, avgY, 0.72);
        } else {
            resetZoom();
            draw();
        }
    }
}

function setupInteractions() {
    canvas.addEventListener("mousemove", (event) => {
        if (!networkData || filteredNodes.length === 0) return;
        
        const rect = canvas.getBoundingClientRect();
        const mouseX = (event.clientX - rect.left - currentTransform.x) / currentTransform.k;
        const mouseY = (event.clientY - rect.top - currentTransform.y) / currentTransform.k;
        
        let hoveredNode = null;
        let minDistance = 15 / currentTransform.k;
        
        filteredNodes.forEach(node => {
            const dx = node.x - mouseX;
            const dy = node.y - mouseY;
            const distance = Math.sqrt(dx*dx + dy*dy);
            
            if (distance < minDistance) {
                minDistance = distance;
                hoveredNode = node;
            }
        });
        
        if (hoveredNode) {
            const isBot = hoveredNode.type === 'inorganic';
            
            // Replicating custom forensic note for @Eriol_Gt in the interactive tooltip!
            const isEriol = hoveredNode.id.toLowerCase() === "eriol_gt";
            let roleText = isBot ? '<span class="inorganic-text">Inorgánico (Bot)</span>' : '<span class="organic-text">Orgánico</span>';
            if (isEriol) {
                roleText = '<span class="organic-text">Orgánico</span> <span class="inorganic-text" style="font-size:0.7rem; display:block; margin-top:2px;">[Cuenta Anónima - Nexos Netcenter "la Bendición"]</span>';
            }

            tooltip.innerHTML = `
                <strong>@${hoveredNode.id}</strong>
                Rol: ${roleText}<br>
                Centralidad: ${hoveredNode.val.toFixed(1)}<br>
                Comunidad: Clúster #${hoveredNode.group}
            `;
            
            // Show first so it gets a dimension in the DOM before we measure it
            tooltip.style.opacity = 1;
            
            const tooltipWidth = tooltip.offsetWidth || 200;
            const tooltipHeight = tooltip.offsetHeight || 90;
            
            let posX = event.clientX + 15;
            let posY = event.clientY + 15;
            
            // Boundary checks to prevent overflowing the viewport
            if (posX + tooltipWidth > window.innerWidth) {
                posX = event.clientX - tooltipWidth - 15;
            }
            if (posY + tooltipHeight > window.innerHeight) {
                posY = event.clientY - tooltipHeight - 15;
            }
            
            tooltip.style.left = `${posX}px`;
            tooltip.style.top = `${posY}px`;
            
            canvas.style.cursor = "pointer";
        } else {
            tooltip.style.opacity = 0;
            canvas.style.cursor = "default";
        }
    });
}
