# Audio over IP Tester
The Audio over IP Tester is designed to test [aes67-monitor](https://github.com/philhartung/aes67-monitor). It processes SDP files to generate streams based on the provided configurations and broadcasts the SDP across the network using the Session Announcement Protocol.

## Tests
SDP Files for several stream configurations are provided under `sdp/tests/`:

| Codec | Samplerate | Channels | Packet Time |
|-------|------------|----------|-------------|
| L16   | 48kHz      | 1        | 0.125ms     |
| L16   | 48kHz      | 1        | 1ms         |
| L16   | 48kHz      | 8        | 0.125ms     |
| L16   | 48kHz      | 8        | 1ms         |
| L16   | 48kHz      | 64       | 0.125ms     |
| L16   | 96kHz      | 1        | 0.125ms     |
| L16   | 96kHz      | 1        | 1ms         |
| L16   | 96kHz      | 4        | 1ms         |
| L16   | 96kHz      | 8        | 0.125ms     |
| L16   | 96kHz      | 32       | 0.125ms     |
| L24   | 48kHz      | 1        | 0.125ms     |
| L24   | 48kHz      | 1        | 1ms         |
| L24   | 48kHz      | 8        | 0.125ms     |
| L24   | 48kHz      | 8        | 1ms         |
| L24   | 48kHz      | 64       | 0.125ms     |
| L24   | 96kHz      | 1        | 0.125ms     |
| L24   | 96kHz      | 1        | 1ms         |
| L24   | 96kHz      | 4        | 1ms         |
| L24   | 96kHz      | 8        | 0.125ms     |
| L24   | 96kHz      | 32       | 0.125ms     |
