#!/usr/bin/env python3
import sys
import argparse
import gi
import random

# Require the GStreamer 1.0 API
gi.require_version('Gst', '1.0')
gi.require_version('GObject', '2.0')
from gi.repository import Gst, GLib

def bus_call(bus, message, loop):
    """
    Callback to handle GStreamer bus messages.
    """
    message_type = message.type
    if message_type == Gst.MessageType.EOS:
        print("End-Of-Stream reached.")
        loop.quit()
    elif message_type == Gst.MessageType.ERROR:
        err, debug = message.parse_error()
        print(f"Error: {err.message}")
        if debug:
            print(f"Debug info: {debug}")
        loop.quit()
    return True

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Generate RTP audio streams using GStreamer.")
    parser.add_argument("--codec", choices=["l16", "l24"], default="l24",
                        help="Audio codec: l16 or l24 (default: l24)")
    parser.add_argument("--packettime", type=float, default="1",
                        help="Packet time (default: 1ms)")
    parser.add_argument("--channels", type=int, choices=range(1, 65), default=8,
                        help="Number of audio channels (1-64, default: 8)")
    parser.add_argument("--samplerate", type=int, choices=[48000, 96000], default=48000,
                        help="Sample rate: 48000 or 96000 (default: 48000)")
    parser.add_argument("--udp-port", type=int, default=5004,
                        help="UDP port number (default: 5004)")
    parser.add_argument("--multicast-address", default="239.69.0.121",
                        help="UDP multicast address (default: 239.69.0.121)")
    parser.add_argument("--multicast-iface", default="en7",
                        help="UDP multicast interface (default: en7)")
    parser.add_argument("--audiotestsrc-params", default="",
                        help="Additional audiotestsrc parameters (e.g., 'freq=480 volume=0.1')")

    args = parser.parse_args()

    # Set audio format and RTP payload element based on the codec parameter
    if args.codec == "l24":
        audio_format = "S24BE"
        rtp_pay = "rtpL24pay"
    else:
        audio_format = "S16BE"
        rtp_pay = "rtpL16pay"

    # Convert packet time to nanoseconds
    packet_time_ns = int(args.packettime * 1000000);

    # Build audiotestsrc element string including additional parameters if provided
    audiotestsrc_str = "audiotestsrc "
    if args.audiotestsrc_params.strip():
        audiotestsrc_str += " " + args.audiotestsrc_params.strip()
    else:
        audiotestsrc_str += "freq=" + str(random.randint(240, 1000))

    # Construct the full GStreamer pipeline string
    pipeline_str = (
        f"{audiotestsrc_str} ! "
        "audioconvert ! "
        f"audio/x-raw,format={audio_format},channels={args.channels},rate={args.samplerate} ! "
        f"{rtp_pay} name=rtppay min-ptime={packet_time_ns} max-ptime={packet_time_ns} ! "
        f"application/x-rtp,clock-rate={args.samplerate},channels={args.channels},payload=98 ! "
        f"udpsink host={args.multicast_address} port={args.udp_port} qos=true qos-dscp=34 multicast-iface={args.multicast_iface}"
    )

    print("Starting GStreamer Pipeline:")
    print(pipeline_str)

    # Initialize GStreamer
    Gst.init(None)

    # Create the pipeline using the constructed pipeline string
    pipeline = Gst.parse_launch(pipeline_str)
    if not pipeline:
        print("Failed to create pipeline")
        sys.exit(1)

    # Create a GLib MainLoop to run the pipeline
    loop = GLib.MainLoop()

    # Set up bus to handle messages (errors, EOS, etc.)
    bus = pipeline.get_bus()
    bus.add_signal_watch()
    bus.connect("message", bus_call, loop)

    # Start playing the pipeline
    ret = pipeline.set_state(Gst.State.PLAYING)
    if ret == Gst.StateChangeReturn.FAILURE:
        print("Unable to set the pipeline to the playing state.")
        sys.exit(1)

    try:
        loop.run()
    except KeyboardInterrupt:
        print("Interrupted by user, stopping...")
    finally:
        # Clean up: stop the pipeline
        pipeline.set_state(Gst.State.NULL)

if __name__ == '__main__':
    main()
