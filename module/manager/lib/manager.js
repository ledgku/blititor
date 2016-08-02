var fs = require('fs');
var bcrypt = require('bcrypt');
var mkdirp = require('mkdirp');
var winston = require('winston');
var moment = require('moment');
var useragent = require('useragent');

var misc = require('../../../core/lib/misc');
var common = require('../../../core/lib/common');
var connection = require('../../../core/lib/connection');   // todo: can load from CLI modules

var account = require('../../account');
var counter = require('../../counter');

var db = require('./database');

var userPrivilege = misc.getUserPrivilege();
var routeTable = misc.getRouteTable();

function indexPage(req, res) {
    var params = {
        title: "운영자 화면",
        week: Number(req.query['w']) || moment().format('W'),
        weekly: true
    };

    var mysql = connection.get();

    db.readPageCounterByDate(mysql, params.weekly, params.week, function (error, result) {
        if (error) {
            req.flash('error', {msg: '계정 목록 읽기에 실패했습니다.'});

            winston.error(error);

            res.redirect('back');
        }

        params.pagination = false;
        // params.total = result.total;
        // params.hasNext = result.total > (result.page + 1) * result.pageSize;
        // params.hasPrev = result.page > 0;
        // params.maxPage = result.maxPage + 1;
        // params.page = result.page + 1;  // prevent when wrong page number assigned
        // params.list = result.accountCounter;

/*
        params.list.map(function (item) {
            item.date = common.dateFormatter(item.date, 'M월 D일');
        });
*/

        res.render(BLITITOR.config.site.adminTheme + '/manage/index', params);
    });
}

function loginForm(req, res) {
    var params = {
        title: "운영자 화면"
    };

    res.render(BLITITOR.config.site.manageTheme + '/manage/login', params);
}

function loginProcess(req, res) {
    req.assert('id', 'Email as Manager ID field is not valid').notEmpty().withMessage('Manager ID is required').isEmail();
    req.assert('password', 'Password must be at least 4 characters long').len(4);

    var errors = req.validationErrors();

    if (errors) {
        req.flash('error', errors);
        return res.redirect('back');
    }

    req.sanitize('password').trim();

    var params = {
        managerID: req.body.id,
        password: req.body.password
    };

    account.authByUserID(params.managerID, function (err, auth) {
        if (err) {
            return done(err);
        }
        if (!auth) {
            return done(null, false, {message: 'Unknown user ' + userID});
        }

        // winston.verbose(auth, userID, password);

        bcrypt.compare(params.password, auth.user_password, function (err, result) {
            if (err) {
                winston.error("bcrypt system error", err);

                return res.redirect('back');
            }
            if (!result) {
                winston.verbose('user given password not exactly same with authorized hash', result);

                req.flash('error', {msg: '로그인 과정에 문제가 발생했습니다.'});

                return res.redirect('back');
            } else {
                // retrieve with auth
                account.findByID(auth.id, function (error, userData) {
                    var user = {
                        id: userData.id,
                        uuid: userData.uuid,
                        user_id: auth.user_id,
                        nickname: userData.nickname,
                        level: userData.level,
                        grant: userData.grant
                    };

                    if (user.grant.indexOf(userPrivilege.siteManager) > -1) {
                        req.logIn(user, function (err) {
                            if (err) {
                                req.flash('error', {msg: '로그인 과정에 문제가 발생했습니다.'});

                                winston.error(error);

                                return res.redirect('back');
                            }

                            res.redirect(routeTable.manage_root);
                        });
                    } else {
                        req.flash('error', {msg: 'You have not Manager privilege'});

                        winston.error(error);

                        return res.redirect('back');
                    }
                });
            }
        });
    });
}

function accountList(req, res) {
    var params = {
        title: "운영자 화면",
        page: Number(req.query['p']) || 1
    };

    var mysql = connection.get();

    db.readAccountByPage(mysql, Number(params.page - 1), function (error, result) {
        if (error) {
            req.flash('error', {msg: '계정 목록 읽기에 실패했습니다.'});

            winston.error(error);

            res.redirect('back');
        }

        params.pagination = true;
        params.total = result.total;
        params.pageSize = result.pageSize;
        params.hasNext = result.total > (result.page + 1) * result.pageSize;
        params.hasPrev = result.page > 0;
        params.maxPage = result.maxPage + 1;
        params.page = result.page + 1;  // prevent when wrong page number assigned
        params.list = result.accountList;

        params.list.map(function (item) {
            item.last_logged_at = !(item.last_logged_at) ? '' : moment(item.last_logged_at).fromNow();
            item.created_at = common.dateFormatter(item.created_at);
            item.updated_at = common.dateFormatter(item.updated_at);
        });

        res.render(BLITITOR.config.site.adminTheme + '/manage/account', params);
    });
}

function accountCounter(req, res) {
    var params = {
        title: "운영자 화면",
        month: req.query['m'] || moment().format('YYYYMM')
    };

    var mysql = connection.get();

    db.readAccountCounterByMonth(mysql, params.month, function (error, result) {
        if (error) {
            req.flash('error', {msg: '계정 목록 읽기에 실패했습니다.'});

            winston.error(error);

            res.redirect('back');
        }

        params.pagination = false;
        params.total = result.total;
        // params.hasNext = result.total > (result.page + 1) * result.pageSize;
        // params.hasPrev = result.page > 0;
        // params.maxPage = result.maxPage + 1;
        // params.page = result.page + 1;  // prevent when wrong page number assigned
        params.list = result.accountCounter;

        params.list.map(function (item) {
            item.date = common.dateFormatter(item.date, 'M월 D일');
        });

        res.render(BLITITOR.config.site.adminTheme + '/manage/account_counter', params);
    });
}

function pageLogList(req, res) {
    var params = {
        title: "운영자 화면",
        page: Number(req.query['p']) || 1
    };

    var mysql = connection.get();

    db.readVisitLogByPage(mysql, Number(params.page - 1), function (error, result) {
        if (error) {
            req.flash('error', {msg: '로그 목록 읽기에 실패했습니다.'});

            winston.error(error);

            res.redirect('back');
        }

        params.pagination = true;
        params.total = result.total;
        params.pageSize = result.pageSize;
        params.hasNext = result.total > (result.page + 1) * result.pageSize;
        params.hasPrev = result.page > 0;
        params.maxPage = result.maxPage + 1;
        params.page = result.page + 1;  // prevent when wrong page number assigned
        params.list = result.visitLogList;

        params.list.map(function (item) {
            item.created_at = common.dateFormatter(item.created_at, 'MM-DD HH:mm');
        });

        res.render(BLITITOR.config.site.adminTheme + '/manage/page_log', params);
    });
}

module.exports = {
    index: indexPage,   // page counter
    loginForm: loginForm,
    loginProcess: loginProcess,
    account: accountList,
    accountCounter: accountCounter,
    pageLog: pageLogList,
    // write: writeForm,
    // save: savePost,
    // view: viewPost,
    // recentPost: recentPost
};