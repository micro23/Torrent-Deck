import { IScope } from "angular";
import type { ModalController } from "@renderer/app/directives/modal/modal.controller";
import type { CertificateResponseService } from "@renderer/app/services/certificate-response";
import type { CertificatePrompt, UpdateEvent } from "@shared/ipc-contract";

interface Notice {
    title: string;
    message: string;
    type: string;
    delay?: number;
    timer?: angular.IPromise<void>;
}

interface NotificationsCenterScope extends IScope {
    updateData: {
        releaseDate?: string;
        updateUrl?: string;
        [key: string]: any;
    };
    notifications: Notice[];
    manualUpdate?: boolean;
    close: (index: number) => void;
    installUpdate: () => boolean;
    installCertificate: () => void;
    allowInsecureTls: () => void;
    confirmInsecureTls: () => boolean | void;
    insecureTlsResult: (accepted: boolean) => void;
    certificate: any;
    insecureTlsCertificate: any;
    certificateResult: (accepted: boolean) => void;
    certificateModalRef?: ModalController;
    insecureTlsModalRef?: ModalController;
    updateModalRef?: ModalController;
}

export class NotificationsCenterController {
    static $inject = ["$scope", "$rootScope", "$timeout", "settingsService", "notificationService", "certificateResponseService"];

    constructor(
        $scope: NotificationsCenterScope,
        $rootScope: angular.IRootScopeService,
        $timeout: angular.ITimeoutService,
        settingsService: any,
        $notify: any,
        certificateResponseService: CertificateResponseService,
    ) {
        const electorrent = window.electorrent
        let insecureTlsFlowActive = false;

        $scope.updateData = {
            releaseDate: "Just now...",
            updateUrl: "https://github.com/micro23/Torrent-Deck/releases",
        };

        $scope.notifications = [];

        $scope.close = (index: number) => {
            const [notice] = $scope.notifications.splice(index, 1);
            if (notice?.timer) $timeout.cancel(notice.timer);
        };

        const unsubscribe = $rootScope.$on("notification", (_event: unknown, data: Notice) => {
            let notice = $scope.notifications.find(item =>
                item.type === data.type && item.title === data.title && item.message === data.message);
            if (!notice) {
                notice = { ...data };
                $scope.notifications.push(notice);
            }
            if (notice.timer) $timeout.cancel(notice.timer);
            notice.timer = $timeout(() => {
                $scope.notifications = $scope.notifications.filter(item => item !== notice);
            }, data.delay || 5000);
        });
        $scope.$on("$destroy", () => {
            unsubscribe();
            $scope.notifications.forEach(notice => $timeout.cancel(notice.timer));
        });

        const showCertModal = () => {
            $timeout(() => {
                $scope.certificateModalRef?.showModal();
            }, 0);
        };

        electorrent.updates.onStatus((event: UpdateEvent) => {
            $timeout(() => {
                const data = Object.assign(event.type === "checking" ? {} : $scope.updateData, event.data || {}, {
                    status: event.type,
                    message: event.message,
                });
                $scope.manualUpdate = !!data.manual;
                $scope.updateData = data;
                $scope.updateModalRef?.showModal();
                $scope.updateModalRef?.refreshModal();
            }, 0);
        });

        $scope.installUpdate = () => {
            if ($scope.updateData.status === "available") {
                $scope.updateData.status = "downloading";
                void electorrent.updates.download();
                return false;
            }
            if ($scope.updateData.status !== "downloaded") return false;
            if ($scope.manualUpdate) {
                electorrent.updates.installDownloaded();
            } else {
                electorrent.updates.installAuto();
            }
            return true;
        };

        electorrent.certificates.onChallenge((cert: CertificatePrompt) => {
            $scope.installCertificate = () => {
                if (cert.source === "node-client-check") {
                    electorrent.certificates.install({
                        fingerprint: cert.fingerprint,
                        raw: cert.raw,
                    }).then((result) => {
                        certificateResponseService.resolve(cert.serverId, { fingerprint: result.fingerprint });
                        $rootScope.$broadcast("certificate-installed", cert.serverId, result.fingerprint);
                        $notify.ok("Certificate installed", "The certificate has been trusted for this server to use");
                    }).catch((err: unknown) => {
                        certificateResponseService.reject(cert.serverId, err);
                        $notify.alert("Could not install certificate", String(err));
                    })
                } else {
                    settingsService.trustCertificate(cert).catch((err: unknown) => {
                        $notify.alert("Could not trust certificate", String(err));
                    });
                }
            };
            $scope.allowInsecureTls = () => {
                if (!cert.serverId) {
                    return;
                }
                insecureTlsFlowActive = true;
                $scope.insecureTlsCertificate = cert;
                $scope.insecureTlsModalRef?.showModal();
            };
            $scope.confirmInsecureTls = () => {
                if (!cert.serverId) {
                    return false;
                }

                const saveInsecureTls = settingsService.getServer(cert.serverId)
                    ? settingsService.enableInsecureTls(cert.serverId)
                    : Promise.resolve();

                saveInsecureTls.then(() => {
                    $scope.certificateModalRef?.hideModal();
                    certificateResponseService.resolve(cert.serverId, { tlsSecurity: "insecure" });
                    $notify.warning("Insecure TLS enabled", "TLS certificate verification is disabled for this server");
                }).catch((err: unknown) => {
                    certificateResponseService.reject(cert.serverId, err);
                    $notify.alert("Could not enable Insecure TLS", String(err));
                });
                return true;
            };
            $scope.insecureTlsResult = (accepted: boolean) => {
                if (!accepted) {
                    insecureTlsFlowActive = false;
                }
            };
            $scope.certificate = cert;
            showCertModal();
        });

        $scope.installCertificate = () => {
            settingsService.trustCertificate($scope.certificate);
        };

        $scope.certificateResult = (accepted: boolean) => {
            if (!accepted && !insecureTlsFlowActive) {
                certificateResponseService.reject($scope.certificate?.serverId);
            }
            insecureTlsFlowActive = false;
        };
    }
}
