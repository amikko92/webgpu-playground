import { displayError } from "../utils/displayError";
import { rand } from "../utils/random";

type ObjectInfo = {
    scale: number;
    uniformBuffer: GPUBuffer;
    uniformValues: Float32Array;
    bindGroup: GPUBindGroup;
};

async function main() {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter?.requestDevice();

    if (!device) {
        displayError("This page requires WebGPU");
        return;
    }

    const canvas = document.querySelector("canvas");
    const context = canvas?.getContext("webgpu");

    if (!canvas || !context) {
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
            struct MyStruct {
                color: vec4f,
                offset: vec2f,
            }

            struct OtherStruct {
                scale: vec2f,
                time: f32,
            }

            @group(0) @binding(0) var<uniform> myStruct: MyStruct;
            @group(0) @binding(1) var<uniform> otherStruct: OtherStruct;

            @vertex fn vert(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
                let positions = array(
                    vec2f(0.0, 0.5),    // Top
                    vec2f(-0.5, -0.5),  // Bottom left
                    vec2f(0.5, -0.5),   // Bottom right
                );

                // Make triangle scale up and down 
                let scale = otherStruct.scale * ((1.2 + sin(otherStruct.time / 1500)) / 2);

                return vec4f(
                    positions[vertexIndex] * scale + myStruct.offset,
                    0.0, 
                    1.0
                );
            }

            @fragment fn frag() -> @location(0) vec4f {
                return myStruct.color;
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

    // Resource on for memory alignment:
    // https://webgpufundamentals.org/webgpu/lessons/webgpu-memory-layout.html
    // Online tool that helps visualize memory layout:
    // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#
    const staticUniformBufferSize =
        4 * 4 + // color: 4 32bit float (4 bytes each)
        2 * 4 + // offset: 4 32bit float (4 bytes each)
        2 * 4; //  Padding: 2 32bit "holes" (4 bytes each)

    const uniformBufferSize =
        2 * 4 + // scale: 2 32bit float (4 bytes each)
        1 * 4 + // time: 1 32bit float (4 bytes)
        1 * 4; //  Padding: 1 32bit "holes" (4 bytes each)

    // Offsets to uniform values
    const kColorOffset = 0; // 0 bytes in
    const kOffsetOffset = 4; // 4 bytes in (0 + 4 color floats)

    const kScaleOffset = 0; // 0 bytes in
    const kTimeOffset = 2; // 2 bytes in (0 + 2 offset floats)

    const kNumObjects = 100;
    const objectInfos: ObjectInfo[] = [];

    // Generate triangles
    for (let i = 0; i < kNumObjects; i++) {
        const staticUniformBuffer = device.createBuffer({
            label: "static uniforms for triangles",
            size: staticUniformBufferSize,
            usage:
                GPUBufferUsage.UNIFORM | // Use with uniforms
                GPUBufferUsage.COPY_DST, // Update by copying data to it
        });

        // Only set static values once
        {
            // Typed array to hold uniform values
            const staticUniformValues = new Float32Array(
                staticUniformBufferSize / 4
            ); // 4 bytes per float

            // Set a random color
            staticUniformValues.set(
                [rand(0, 1), rand(0, 1), rand(0, 1), 1],
                kColorOffset
            );

            // Set a random offset
            staticUniformValues.set([rand(-1, 1), rand(-1, 1)], kOffsetOffset);

            device.queue.writeBuffer(
                staticUniformBuffer,
                0,
                staticUniformValues
            );
        }

        // Typed array to hold uniform values
        const uniformValues = new Float32Array(uniformBufferSize / 4); // 4 bytes per float
        const uniformBuffer = device.createBuffer({
            label: "uniforms for triangles",
            size: uniformBufferSize,
            usage:
                GPUBufferUsage.UNIFORM | // Use with uniforms
                GPUBufferUsage.COPY_DST, // Update by copying data to it
        });

        // Init time
        uniformValues.set([0], kTimeOffset);

        const bindGroup = device.createBindGroup({
            label: `triangle bind group for obj: ${i}`,
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: staticUniformBuffer } },
                { binding: 1, resource: { buffer: uniformBuffer } },
            ],
        });

        objectInfos.push({
            scale: rand(0.2, 0.5),
            uniformBuffer,
            uniformValues,
            bindGroup,
        });
    }

    const render = (timeStamp: number) => {
        requestAnimationFrame(render);
        const time = timeStamp ?? 0;

        // Set scale to half and account for aspect ratio
        const aspect = canvas.width / canvas.height;

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

        for (const objectInfo of objectInfos) {
            const { bindGroup, scale, uniformBuffer, uniformValues } =
                objectInfo;

            // Set scale to half and account for aspect ratio
            uniformValues.set([scale / aspect, scale], kScaleOffset);

            // Update time
            uniformValues.set([time], kTimeOffset);

            // Copy uniform values from javascript to GPU
            device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

            pass.setBindGroup(0, bindGroup);

            pass.draw(3);
        }

        pass.end();

        // Submit commands to the GPU to be executed
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    };

    const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const canvas = entry.target;
            const width = entry.contentBoxSize[0].inlineSize;
            const height = entry.contentBoxSize[0].blockSize;
            if (canvas instanceof HTMLCanvasElement) {
                canvas.width = Math.max(
                    1,
                    Math.min(width, device.limits.maxTextureDimension2D)
                );
                canvas.height = Math.max(
                    1,
                    Math.min(height, device.limits.maxTextureDimension2D)
                );
            }
        }
    });

    resizeObserver.observe(canvas);
    requestAnimationFrame(render);
}

main();
