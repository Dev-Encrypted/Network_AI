use sha2::{Digest, Sha256};
pub const HEADER: usize = 13;
pub const MAX_PAYLOAD: usize = 65536;
pub const MAX_FRAME: usize = HEADER + MAX_PAYLOAD;
pub const RESPONSE: usize = 45;
pub const OK: u8 = 0;
pub const UNAUTHORIZED: u8 = 1;
pub const REPLAY: u8 = 2;
pub const MALFORMED: u8 = 3;
#[derive(Default)]
pub struct Gate {
    last_sequence: u64,
}
pub fn request(sequence: u64, size: usize) -> Vec<u8> {
    let mut frame = Vec::with_capacity(HEADER + size);
    frame.push(1);
    frame.extend_from_slice(&sequence.to_be_bytes());
    frame.extend_from_slice(&(size as u32).to_be_bytes());
    frame.extend((0..size).map(|n| (n % 251) as u8));
    frame
}
pub fn parse(frame: &[u8]) -> Option<(u64, &[u8])> {
    if frame.len() < HEADER || frame.len() > MAX_FRAME || frame[0] != 1 {
        return None;
    }
    let sequence = u64::from_be_bytes(frame[1..9].try_into().ok()?);
    let size = u32::from_be_bytes(frame[9..13].try_into().ok()?) as usize;
    if sequence == 0 || size != frame.len() - HEADER || size > MAX_PAYLOAD {
        return None;
    }
    Some((sequence, &frame[HEADER..]))
}
impl Gate {
    pub fn respond(&mut self, authorized: bool, frame: &[u8]) -> Vec<u8> {
        let mut response = vec![0; RESPONSE];
        if !authorized {
            response[0] = UNAUTHORIZED;
            return response;
        }
        let Some((sequence, payload)) = parse(frame) else {
            response[0] = MALFORMED;
            return response;
        };
        if sequence <= self.last_sequence {
            response[0] = REPLAY;
            return response;
        }
        self.last_sequence = sequence;
        response[1..9].copy_from_slice(&sequence.to_be_bytes());
        response[9..41].copy_from_slice(&Sha256::digest(payload));
        response[41..45].copy_from_slice(&(payload.len() as u32).to_be_bytes());
        response
    }
}
pub fn verified(response: &[u8], request: &[u8]) -> bool {
    let Some((sequence, payload)) = parse(request) else {
        return false;
    };
    response.len() == RESPONSE
        && response[0] == OK
        && response[1..9] == sequence.to_be_bytes()
        && response[9..41] == Sha256::digest(payload)[..]
        && response[41..45] == (payload.len() as u32).to_be_bytes()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_replay_without_advancing_on_unauthorized_input() {
        let mut gate = Gate::default();
        let frame = request(1, 64);
        assert_eq!(gate.respond(false, &frame)[0], UNAUTHORIZED);
        assert!(verified(&gate.respond(true, &frame), &frame));
        assert_eq!(gate.respond(true, &frame)[0], REPLAY);
        assert!(verified(
            &gate.respond(true, &request(2, 64)),
            &request(2, 64)
        ));
    }
    #[test]
    fn rejects_length_confusion_truncation_version_and_oversize() {
        let mut frame = request(1, 64);
        frame[12] = 63;
        assert!(parse(&frame).is_none());
        assert!(parse(&[1; 12]).is_none());
        assert!(parse(&request(1, MAX_PAYLOAD + 1)).is_none());
        let mut frame = request(1, 0);
        frame[0] = 2;
        assert!(parse(&frame).is_none());
    }
}
