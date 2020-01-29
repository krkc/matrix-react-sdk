/*
Copyright 2019, 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React from "react";
import PropTypes from "prop-types";

import * as sdk from '../../../index';
import {verificationMethods} from 'matrix-js-sdk/src/crypto';
import VerificationQRCode from "../elements/crypto/VerificationQRCode";
import {MatrixClientPeg} from "../../../MatrixClientPeg";
import {_t} from "../../../languageHandler";
import E2EIcon from "../rooms/E2EIcon";
import {
    PHASE_UNSENT,
    PHASE_REQUESTED,
    PHASE_READY,
    PHASE_DONE,
    PHASE_STARTED,
    PHASE_CANCELLED,
} from "matrix-js-sdk/src/crypto/verification/request/VerificationRequest";
import Spinner from "../elements/Spinner";

export default class VerificationPanel extends React.PureComponent {
    static propTypes = {
        request: PropTypes.object.isRequired,
        member: PropTypes.object.isRequired,
        phase: PropTypes.oneOf([
            PHASE_UNSENT,
            PHASE_REQUESTED,
            PHASE_READY,
            PHASE_STARTED,
            PHASE_CANCELLED,
            PHASE_DONE,
        ]).isRequired,
        onClose: PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);
        this.state = {};
        this._hasVerifier = false;
    }

    renderQRPhase(pending) {
        const {member, request} = this.props;
        const AccessibleButton = sdk.getComponent('elements.AccessibleButton');

        let button;
        if (pending) {
            button = <Spinner />;
        } else {
            button = (
                <AccessibleButton kind="primary" className="mx_UserInfo_wideButton" onClick={this._startSAS}>
                    {_t("Verify by emoji")}
                </AccessibleButton>
            );
        }

        const cli = MatrixClientPeg.get();
        const crossSigningInfo = cli.getStoredCrossSigningForUser(request.otherUserId);
        if (!crossSigningInfo || !request.requestEvent || !request.requestEvent.getId()) {
            // for whatever reason we can't generate a QR code, offer only SAS Verification
            return <div className="mx_UserInfo_container">
                <h3>Verify by emoji</h3>
                <p>{_t("Verify by comparing unique emoji.")}</p>

                { button }
            </div>;
        }

        const myKeyId = cli.getCrossSigningId();
        const qrCodeKeys = [
            [cli.getDeviceId(), cli.getDeviceEd25519Key()],
            [myKeyId, myKeyId],
        ];

        // TODO: add way to open camera to scan a QR code
        return <React.Fragment>
            <div className="mx_UserInfo_container">
                <h3>Verify by scanning</h3>
                <p>{_t("Ask %(displayName)s to scan your code:", {
                    displayName: member.displayName || member.name || member.userId,
                })}</p>

                <div className="mx_VerificationPanel_qrCode">
                    <VerificationQRCode
                        keyholderUserId={MatrixClientPeg.get().getUserId()}
                        requestEventId={request.requestEvent.getId()}
                        otherUserKey={crossSigningInfo.getId("master")}
                        secret={request.encodedSharedSecret}
                        keys={qrCodeKeys}
                    />
                </div>
            </div>

            <div className="mx_UserInfo_container">
                <h3>Verify by emoji</h3>
                <p>{_t("If you can't scan the code above, verify by comparing unique emoji.")}</p>

                { button }
            </div>
        </React.Fragment>;
    }

    renderVerifiedPhase() {
        const {member} = this.props;

        const AccessibleButton = sdk.getComponent('elements.AccessibleButton');
        return (
            <div className="mx_UserInfo_container mx_VerificationPanel_verified_section">
                <h3>Verified</h3>
                <p>{_t("You've successfully verified %(displayName)s!", {
                    displayName: member.displayName || member.name || member.userId,
                })}</p>
                <E2EIcon isUser={true} status="verified" size={128} />
                <p>Verify all users in a room to ensure it's secure.</p>

                <AccessibleButton kind="primary" className="mx_UserInfo_wideButton" onClick={this.props.onClose}>
                    {_t("Got it")}
                </AccessibleButton>
            </div>
        );
    }

    renderCancelledPhase() {
        const {member, request} = this.props;

        const AccessibleButton = sdk.getComponent('elements.AccessibleButton');

        let text;
        if (request.cancellationCode === "m.timeout") {
            text = _t("Verification timed out. Start verification again from their profile.");
        } else if (request.cancellingUserId === request.otherUserId) {
            text = _t("%(displayName)s cancelled verification. Start verification again from their profile.", {
                displayName: member.displayName || member.name || member.userId,
            });
        } else {
            text = _t("You cancelled verification. Start verification again from their profile.");
        }

        return (
            <div className="mx_UserInfo_container">
                <h3>Verification cancelled</h3>
                <p>{ text }</p>

                <AccessibleButton kind="primary" className="mx_UserInfo_wideButton" onClick={this.props.onClose}>
                    {_t("Got it")}
                </AccessibleButton>
            </div>
        );
    }

    render() {
        const {member, phase} = this.props;

        const displayName = member.displayName || member.name || member.userId;

        switch (phase) {
            case PHASE_READY:
                return this.renderQRPhase();
            case PHASE_STARTED:
                if (this.state.sasEvent) {
                    const VerificationShowSas = sdk.getComponent('views.verification.VerificationShowSas');
                    return <div className="mx_UserInfo_container">
                        <h3>Compare emoji</h3>
                        <VerificationShowSas
                            displayName={displayName}
                            sas={this.state.sasEvent.sas}
                            onCancel={this._onSasMismatchesClick}
                            onDone={this._onSasMatchesClick}
                        />
                    </div>;
                } else {
                    return this.renderQRPhase(true); // keep showing same phase but with a spinner
                }
            case PHASE_DONE:
                return this.renderVerifiedPhase();
            case PHASE_CANCELLED:
                return this.renderCancelledPhase();
        }
        console.error("VerificationPanel unhandled phase:", phase);
        return null;
    }

    _startSAS = async () => {
        const verifier = this.props.request.beginKeyVerification(verificationMethods.SAS);
        try {
            await verifier.verify();
        } catch (err) {
            console.error(err);
        }
    };

    _onSasMatchesClick = () => {
        this.state.sasEvent.confirm();
    };

    _onSasMismatchesClick = () => {
        this.state.sasEvent.mismatch();
    };

    _onVerifierShowSas = (sasEvent) => {
        this.setState({sasEvent});
    };

    _onRequestChange = async () => {
        const {request} = this.props;
        const hadVerifier = this._hasVerifier;
        this._hasVerifier = !!request.verifier;
        if (!hadVerifier && this._hasVerifier) {
            request.verifier.once('show_sas', this._onVerifierShowSas);
            try {
                // on the requester side, this is also awaited in _startSAS,
                // but that's ok as verify should return the same promise.
                await request.verifier.verify();
            } catch (err) {
                console.error("error verify", err);
            }
        }
    };

    componentDidMount() {
        this.props.request.on("change", this._onRequestChange);
        this._onRequestChange();
    }

    componentWillUnmount() {
        this.props.request.off("change", this._onRequestChange);
    }
}
