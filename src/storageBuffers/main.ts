import { displayError } from "../utils/displayError";
import { rand } from "../utils/random";

type ObjectInfo = {
    scale: number;
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

            struct VertOut {
                @builtin(position) position: vec4f,
                @location(0) color: vec4f,
            }

            @group(0) @binding(0) var<storage, read> myStructs: array<MyStruct>;
            @group(0) @binding(1) var<storage, read> otherStructs: array<OtherStruct>;

            @vertex fn vert(
                @builtin(vertex_index) vertexIndex: u32, 
                @builtin(instance_index) instanceIndex: u32
            ) -> VertOut {
                let positions = array(
                    vec2f(0.0, 0.5),    // Top
                    vec2f(-0.5, -0.5),  // Bottom left
                    vec2f(0.5, -0.5),   // Bottom right
                );

                let otherStruct = otherStructs[instanceIndex];
                let myStruct = myStructs[instanceIndex];

                // Make triangle scale up and down 
                let scale = otherStruct.scale * ((1.2 + sin(otherStruct.time / 1500)) / 2);

                var out: VertOut;
                out.position = vec4f(
                    positions[vertexIndex] * scale + myStruct.offset,
                    0.0, 
                    1.0
                );
                out.color = myStruct.color;

                return out;
            }

            @fragment fn frag(vertOut: VertOut) -> @location(0) vec4f {
                return vertOut.color;
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

    const kNumObjects = 100;
    const objectInfos: ObjectInfo[] = [];

    // Resource on for memory alignment:
    // https://webgpufundamentals.org/webgpu/lessons/webgpu-memory-layout.html
    // Online tool that helps visualize memory layout:
    // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#
    const staticUnitSize =
        4 * 4 + // color: 4 32bit float (4 bytes each)
        2 * 4 + // offset: 4 32bit float (4 bytes each)
        2 * 4; //  Padding: 2 32bit "holes" (4 bytes each)

    const changingUnitSize =
        2 * 4 + // scale: 2 32bit float (4 bytes each)
        1 * 4 + // time: 1 32bit float (4 bytes)
        1 * 4; //  Padding: 1 32bit "holes" (4 bytes each)

    const staticStorageBufferSize = staticUnitSize * kNumObjects;
    const changingStorageBufferSize = changingUnitSize * kNumObjects;

    // Offsets to storage values
    const kColorOffset = 0; // 0 bytes in
    const kOffsetOffset = 4; // 4 bytes in (0 + 4 color floats)

    const kScaleOffset = 0; // 0 bytes in
    const kTimeOffset = 2; // 2 bytes in (0 + 2 offset floats)

    const staticStorageBuffer = device.createBuffer({
        label: "static storage for triangles",
        size: staticStorageBufferSize,
        usage:
            GPUBufferUsage.STORAGE | // Use with storage
            GPUBufferUsage.COPY_DST, // Update by copying data to it
    });

    const changingStorageBuffer = device.createBuffer({
        label: "changing storage for triangles",
        size: changingStorageBufferSize,
        usage:
            GPUBufferUsage.STORAGE | // Use with storage
            GPUBufferUsage.COPY_DST, // Update by copying data to it
    });

    // Handle static storage values
    {
        // Typed array to hold static storage values
        const staticStorageValues = new Float32Array(
            staticStorageBufferSize / 4
        ); // 4 bytes per float

        // Generate triangles
        for (let i = 0; i < kNumObjects; i++) {
            const staticOffset = i * (staticUnitSize / 4);

            // Only set static values once

            // Set a random color
            staticStorageValues.set(
                [rand(0, 1), rand(0, 1), rand(0, 1), 1],
                staticOffset + kColorOffset
            );

            // Set a random offset
            staticStorageValues.set(
                [rand(-1, 1), rand(-1, 1)],
                staticOffset + kOffsetOffset
            );

            objectInfos.push({
                scale: rand(0.2, 0.5),
            });
        }

        device.queue.writeBuffer(staticStorageBuffer, 0, staticStorageValues);
    }

    // Typed array to hold changing storage values
    const storageValues = new Float32Array(changingStorageBufferSize / 4); // 4 bytes per float

    const bindGroup = device.createBindGroup({
        label: `bind group for objects`,
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: staticStorageBuffer } },
            { binding: 1, resource: { buffer: changingStorageBuffer } },
        ],
    });

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

        for (let i = 0; i < objectInfos.length; i++) {
            const offset = i * (changingUnitSize / 4);

            const { scale } = objectInfos[i];

            // Set scale to half and account for aspect ratio
            storageValues.set([scale / aspect, scale], offset + kScaleOffset);

            // Update time
            storageValues.set([time], offset + kTimeOffset);
        }

        // Upload all scales at once
        device.queue.writeBuffer(changingStorageBuffer, 0, storageValues);

        pass.setBindGroup(0, bindGroup);
        pass.draw(3, kNumObjects);
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
