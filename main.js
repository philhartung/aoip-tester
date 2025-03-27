const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const os = require('os');
const sdpTransform = require('sdp-transform');
const { spawn } = require('child_process');

// Constants and Global Variables
const sdpDirectory = 'sdp';
const interfaces = os.networkInterfaces();
const networkInterface = "en7"; // Change this to your desired network interface
const sourceIp = interfaces[networkInterface].find(i => i.family === 'IPv4').address;
const pythonScriptPath = './stream.py';

// Array to store child processes
const childProcesses = [];

// Create a UDP socket for sending SAP messages
const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

/**
 * Announce the SDP stream using SAP via UDP multicast.
 *
 * @param {string} rawSDP - The raw SDP string.
 * @param {string} addr - The source IP address (e.g., "192.168.1.100").
 * @param {boolean} del - A flag indicating if the announcement is a deletion.
 */
function announceStream(rawSDP, addr, del) {
    // Allocate an 8-byte SAP header buffer
    const sapHeader = Buffer.alloc(8);
    // Create the SAP content type ("application/sdp" with a null terminator)
    const sapContentType = Buffer.from("application/sdp\0");
    // Split the IP address into its octets
    const ip = addr.split(".");

    // Write the first byte: version and flags.
    // If 'del' is true, set the deletion flag.
    if (del) {
        sapHeader.writeUInt8(0x20 | 0x4, 0);
    } else {
        sapHeader.writeUInt8(0x20, 0);
    }

    // Write the header value (2 bytes, little-endian) at offset 2.
    const headerValue = Math.floor(Math.random() * 65536);
    sapHeader.writeUInt16LE(headerValue, 2);

    // Write the IP address octets into the header at offsets 4 to 7.
    sapHeader.writeUInt8(parseInt(ip[0]), 4);
    sapHeader.writeUInt8(parseInt(ip[1]), 5);
    sapHeader.writeUInt8(parseInt(ip[2]), 6);
    sapHeader.writeUInt8(parseInt(ip[3]), 7);

    // Convert the raw SDP string into a Buffer
    const sdpBody = Buffer.from(rawSDP);
    // Concatenate the SAP header, content type, and SDP body into one message
    const sdpMsg = Buffer.concat([sapHeader, sapContentType, sdpBody]);

    // Send the SAP message via UDP multicast to port 9875 and address 239.255.255.255
    socket.send(sdpMsg, 9875, "239.255.255.255", function (err) {
        if (err) {
            console.error("Error sending SDP message:", err);
        }
    });

    // Repeat sending the message every 30 seconds
    setInterval(() => {
        socket.send(sdpMsg, 9875, "239.255.255.255", function (err) {
            if (err) {
                console.error("Error sending SDP message:", err);
            }
        });
    }, 30000);
}

/**
 * Recursively retrieves all SDP file paths from the specified directory.
 *
 * @param {string} dir - The directory to search.
 * @returns {Promise<string[]>} - A promise that resolves with an array of SDP file paths.
 */
async function getSdpFilesRecursively(dir) {
    let results = [];
    const list = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const dirent of list) {
        const fullPath = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
            const subDirResults = await getSdpFilesRecursively(fullPath);
            results = results.concat(subDirResults);
        } else if (dirent.isFile() && dirent.name.endsWith('.sdp')) {
            results.push(fullPath);
        }
    }
    return results;
}

/**
 * Process a single SDP file:
 *  - Reads the file.
 *  - Parses and modifies the SDP.
 *  - Announces the SDP via SAP.
 *  - Spawns a Python process with the appropriate arguments.
 *
 * @param {string} filePath - The path to the SDP file.
 */
function processSdpFile(filePath) {
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error(`Error reading file ${filePath}:`, err);
            return;
        }
        try {
            // Parse the SDP using sdp-transform
            let sdpObject = sdpTransform.parse(data);

            // Modify the SDP object: update origin IP
            sdpObject.origin.address = sourceIp;

            // Update clock source if using PTP
            if (sdpObject.tsRefClocks && sdpObject.tsRefClocks[0].clksrc === 'ptp') {
                sdpObject.tsRefClocks[0].clksrcExt = 'IEEE1588-2008:7C-2E-0D-FF-FE-00-00-00:0';
            }

            // Update each media session in the SDP
            for (let i = 0; i < sdpObject.media.length; i++) {
                if (sdpObject.media[i].tsRefClocks && sdpObject.media[i].tsRefClocks[0].clksrc === 'ptp') {
                    sdpObject.media[i].tsRefClocks[0].clksrcExt = 'IEEE1588-2008:7C-2E-0D-FF-FE-00-00-00:0';
                }
                if (sdpObject.media[i].sourceFilter) {
                    sdpObject.media[i].sourceFilter.srcList = sourceIp;
                }
            }

            // Convert the (possibly modified) SDP object back into a string
            const newSdp = sdpTransform.write(sdpObject);

            // Announce the SDP via SAP multicast
            announceStream(newSdp, sourceIp, false);

            // Extract stream parameters for the Python script
            for (let i = 0; i < sdpObject.media.length; i++) {
                const rtpInfo = sdpObject.media[i].rtp[0];
                const payloadType = rtpInfo.payload;
                const codec = rtpInfo.codec.toLowerCase();
                const packetTime = sdpObject.media[i].ptime ? sdpObject.media[i].ptime.toString() : "1";
                const packetTimeNS = Math.floor(parseFloat(packetTime) * 1e6);
                const channels = rtpInfo.encoding || 8;
                const sampleRate = rtpInfo.rate || 48000;
                const udpPort = sdpObject.media[i].port || 5004;
                let audiotestsrcStr = 'audiotestsrc freq=' + (Math.floor(Math.random() * (1000 - 240 + 1)) + 240);

                // Determine the multicast address
                let multicastAddress = "239.69.0.121";
                if (sdpObject.media[i].connection) {
                    multicastAddress = sdpObject.media[i].connection.ip.split("/")[0];
                } else if (sdpObject.connection) {
                    multicastAddress = sdpObject.connection.ip.split("/")[0];
                }
                
                // construct pipeline string
                let audioFormat, rtpPay;
                if (codec === 'l24') {
                    audioFormat = 'S24BE';
                    rtpPay = 'rtpL24pay';
                } else {
                    audioFormat = 'S16BE';
                    rtpPay = 'rtpL16pay';
                }

                const pipelineStr =
                    `${audiotestsrcStr} ! ` +
                    `audioconvert ! ` +
                    `audio/x-raw,format=${audioFormat},channels=${channels},rate=${sampleRate} ! ` +
                    `${rtpPay} name=rtppay min-ptime=${packetTimeNS} max-ptime=${packetTimeNS} ! ` +
                    `application/x-rtp,clock-rate=${sampleRate},channels=${channels},payload=${payloadType} ! ` +
                    `udpsink host=${multicastAddress} port=${udpPort} qos=true qos-dscp=34 multicast-iface=${networkInterface}`;

                console.log(pipelineStr)

                // Spawn the Python process as a child process
                const gstProcess = spawn('gst-launch-1.0', pipelineStr.split(' '));
                childProcesses.push(gstProcess);

                gstProcess.stdout.on('data', (data) => {
                    console.log(`Python stdout: ${data}`);
                });

                gstProcess.stderr.on('data', (data) => {
                    console.error(`Python stderr: ${data}`);
                });

                gstProcess.on('close', (code) => {
                    console.log(`Python process exited with code ${code}`);
                });
            }
        } catch (parseError) {
            console.error(`Error parsing SDP in file ${filePath}:`, parseError);
        }
    });
}

/**
 * Cleanup function to terminate all spawned child processes.
 */
function cleanup() {
    console.log("Cleaning up child processes...");
    childProcesses.forEach(child => {
        if (child && !child.killed) {
            console.log(`Killing process with PID ${child.pid}`);
            child.kill('SIGTERM');
        }
    });
}

// Event listeners for process termination
process.on('exit', cleanup);
process.on('SIGINT', () => {
    cleanup();
    process.exit();
});
process.on('SIGTERM', () => {
    cleanup();
    process.exit();
});

/**
 * Main function: searches for all SDP files (including in subdirectories) and processes each one.
 */
async function main() {
    try {
        const sdpFiles = await getSdpFilesRecursively(sdpDirectory);
        sdpFiles.forEach(filePath => {
            processSdpFile(filePath);
        });
    } catch (err) {
        console.error("Error reading SDP files:", err);
    }
}

main();
