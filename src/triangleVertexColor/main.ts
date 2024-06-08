import { displayError } from "../utils/displayError";

async function main() {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter?.requestDevice();

    if (!device) {
        displayError("This page requires WebGPU");
        return;
    }

    const canvas = document.querySelector("canvas");
    const context = canvas?.getContext("webgpu");

    if (!context) {
        displayError("Canvas not found");
        return;
    }

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: presentationFormat,
    });

    const shaderModule = device.createShaderModule({
        label: "Triangle vertex shader",
        code: /*wgsl*/ `
            struct VertexOut {
                @builtin(position) position: vec4f,
                @location(0) color: vec4f,
            }

            @vertex fn vert(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
                let positions = array(
                    vec2f(0.0, 0.5),    // Top
                    vec2f(-0.5, -0.5),  // Bottom left
                    vec2f(0.5, -0.5),   // Bottom right
                );
                let colors = array(
                    vec4f(1.0, 0.0, 0.0, 1.0),
                    vec4f(0.0, 1.0, 0.0, 1.0),
                    vec4f(0.0, 0.0, 1.0, 1.0)               
                );

                var out: VertexOut;
                out.position = vec4f(positions[vertexIndex], 0.0, 1.0);
                out.color = vec4f(colors[vertexIndex]);

                return out;
            }

            @fragment fn frag(input: VertexOut) -> @location(0) vec4f {
                return input.color;
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
                    clearValue: { r: 0.1, g: 0.1, b: 0.2, a: 1.0 },
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

    requestAnimationFrame(render);
}

main();
