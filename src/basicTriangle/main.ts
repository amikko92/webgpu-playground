function displayError(msg: string): void {
    const body = document.querySelector("body");
    const errorParagraph = document.createElement("p");
    errorParagraph.innerText = msg;
    body?.prepend(errorParagraph);
}

async function main() {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();

    // Display error message if WebGPU is not supported
    if (!device) {
        displayError("This page requires WebGPU");
        return;
    }

    const canvas = document.querySelector("canvas");
    const context = canvas?.getContext("webgpu");

    // Display error message if canvas is not supported
    if (!context) {
        displayError("Canvas context for WegGPU not found");
        return;
    }

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: presentationFormat,
    });

    const shaderModule = device.createShaderModule({
        label: "Hardcoded WebGPU triangle",
        code: /* wgsl */ `
            @vertex fn vert(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f {
                let positions = array(
                    vec2f(0.0, 0.5),    // Top
                    vec2f(-0.5, -0.5),  // Bottom left
                    vec2f(0.5, -0.5),   // Bottom right
                );

                return vec4f(positions[vertexIndex], 0.0, 1.0);
            }

            @fragment fn frag() -> @location(0) vec4f {
                return vec4f(1.0, 0.0, 0.0, 1.0);
            }
        `,
    });

    const pipeline = device.createRenderPipeline({
        label: "Hardcoded WebGPU pipeline",
        layout: "auto",
        vertex: {
            entryPoint: "vert",
            module: shaderModule,
        },
        fragment: {
            entryPoint: "frag",
            module: shaderModule,
            targets: [{ format: presentationFormat }],
        },
    });

    const render = () => {
        requestAnimationFrame(render);

        const encoder = device.createCommandEncoder({
            label: "Command Encoder",
        });
        const pass = encoder.beginRenderPass({
            label: "Basic render pass",
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    clearValue: { r: 0.6, g: 0.8, b: 0.9, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        pass.setPipeline(pipeline);
        pass.draw(3);

        pass.end();

        // Submit commands to the GPU to be executed
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    };

    // Start render loop
    requestAnimationFrame(render);
}

main();
