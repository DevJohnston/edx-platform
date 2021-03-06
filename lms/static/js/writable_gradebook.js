function _templateLoader(templateName, staticPath, callback, errorCallback) {
    var templateURL = staticPath + '/common/templates/gradebook/' + templateName + '.underscore';

    $.ajax({
        url: templateURL,
        method: 'GET',
        dataType: 'html',
        success: function (data) {
            callback(data);
        },
        error: function (errorMessage) {
            console.log(errorMessage);
            errorCallback('Error has occurred while rendering table.');
        }
    });
}

function courseXblockUpdater(courseID, dataToSend, visibilityData, callback, errorCallback) {
    var cleanData = _.map(dataToSend, function (data) {
        return {
            user_id: data.user_id,
            usage_id: data.block_id,
            grade: {
                earned_all_override: data.grade || 0,
                possible_all_override: data.max_grade || 0,
                earned_graded_override: data.grade || 0,
                possible_graded_override: data.max_grade || 0
            }
        };
    });

    var postUrl = '/api/grades/v1/gradebook/' + courseID + '/bulk-update';
    $('')
    $.ajax({
        url: postUrl,
        method: 'POST',
        contentType: 'application/json; charset=utf-8',
        dataType: 'json',
        data: JSON.stringify(cleanData),
        success: function (data) {
            callback(data);
        },
        error: function (errorMessage) {
            console.log(errorMessage);
            errorCallback('Error has occurred while updating grades.');
        }
    });
}

function getEdxUserInfoAsObject() {
    var edxCookie = $.cookie('prod-edx-user-info') || $.cookie('stage-edx-user-info') || $.cookie('edx-user-info');
    return JSON.parse(edxCookie.replace(/\\054/g, ',').replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"'));
 
}

$(document).ready(function() {
    var dataTable,
        $gradebookWrapper = $('.gradebook-content'),
        $courseSectionFilter = $gradebookWrapper.find('#course-sections'),
        $errorMessageContainer = $gradebookWrapper.find('#error-message'),
        $filtersWrapper = $gradebookWrapper.find('#filters-container'),
        $gradebookNotification = $gradebookWrapper.find('#gradebook-notification'),
        $gradesTableWrapper = $gradebookWrapper.find('#gradebook-table-container'),
        $gradingPolicyFilter = $filtersWrapper.find('#grading-policy'),
        adjustedGradesData = {},
        courseID = $gradebookWrapper.attr('data-course-id'),
        edxUserInfo = getEdxUserInfoAsObject(),
        gradeBookData = [],
        gradeOverrideObject = {},
        isFetchingComplete = false,
        isFetchingSuccessful = true,
        isManualGrading = false,
        modalDataTable,
        module_list = {'users': {}},
        renderAllGradebook = true,
        sectionBlockId = '',
        staticPath = $gradebookWrapper.attr('data-static-path'),
        userAdjustedGrades = {},
        userAutoGrades = {},
        createMainDataTable = function(studentsDataLength) {
            const $gradebookErrorMessageContainer = $gradebookWrapper.find('#gradebook-table-empty-message');
            const $studentGradesTable = $gradesTableWrapper.find('#student-grades-table');
            const options = {
                fixedColumns: true,
                language: {
                    zeroRecords: ''
                },
                paging: studentsDataLength > 10,
                scrollX: true
            };
            dataTable = initializeDataTable($studentGradesTable, options, studentsDataLength);
            setUpDataTableSearch($studentGradesTable, $gradebookErrorMessageContainer);
            $studentGradesTable.on('draw.dt', displayGrades);
        },
        createModalTable = function(studentsDataLength) {
            const $gradeOverrideModalTable = $gradesTableWrapper.find('#grade-override-modal-table');
            const $modalErrorMessageContainer = $gradesTableWrapper.find('#modal-table-empty-message');
            const options = {
                columnDefs: [{
                    orderable: false,
                    targets: 1
                }],
                language: {
                    zeroRecords: ''
                },
                paging: studentsDataLength > 10
            };
            modalDataTable = initializeDataTable($gradeOverrideModalTable, options, studentsDataLength);
            setUpDataTableSearch($gradeOverrideModalTable, $modalErrorMessageContainer);
        },
        destroyDataTable = function($table) {
            if ($.fn.DataTable.isDataTable($table)) {
                $table.DataTable().destroy();
                $table.unbind();
            }
        },
        displayError = function(message) {
            $errorMessageContainer.text(message);
            $errorMessageContainer.toggleClass('hidden');
        },
        displayAbsoluteGrade = function($cell) {
            var $input = $cell.find('input'),
                title = $cell.attr('title');

            if (title !== 'Total' && title !== 'Current grade' && $input.length) {
                $input.prop('disabled', false);
                $input.val($cell.attr('data-score-earned'));
                return;
            }

            $cell.text($cell.attr('data-score-absolute'));
        },
        displayGrades = function() {
            var display = $('#table-data-view-percent').is(':checked') ? displayPercentGrade : displayAbsoluteGrade;

            $('#save-grade-field').hide();

            $('.data-score-container-class').each(function() {
                display($(this));
            });
        },
        displayPercentGrade = function($cell) {
            var $input = $cell.find('input'),
                title = $cell.attr('title');

            if (title !== 'Total' && $input.length){
                $input.prop('disabled', true);
                $input.val($cell.attr('data-score-percent'));
                return;
            }

            $cell.text($cell.attr('data-score-percent'));
        },
        fetchGrades = function(get_url) {
            $.ajax({
                type: 'GET',
                url: get_url,
                contentType: 'application/json; charset=utf-8',
                success: onPageFetched,
                failure: function(errMsg) {
                    isFetchingComplete = true;
                    isFetchingSuccessful = false;
                    console.log(errMsg);
                    displayError('Error has occurred while fetching grades.');
                }
            });
        },
        filterGradebook = function() {
            var gradingPolicy = $gradingPolicyFilter.val(),
                courseSection = $courseSectionFilter.val(),
                filterClasses = '.user-data';
            if (gradingPolicy && courseSection)
                filterClasses += ',.' + gradingPolicy + '.' + courseSection;
            else if (gradingPolicy || courseSection)
                filterClasses += ',.' + (gradingPolicy || courseSection);
            else
                filterClasses = '';

            dataTable.columns(':not(' + filterClasses + ')').visible(false, false);
            dataTable.columns(filterClasses).visible(true, false);
            dataTable.columns.adjust().draw(false);
        },
        initializeDataTable = function($table, options, studentsDataLength) {
            $table.on('length.dt', function(_, _, tableLength) {
                // If the provided data is longer than the table length selected
                // display the paggination buttons, otherwise hide them.
                $(this).parents('.dataTables_wrapper')
                       .find('.dataTables_paginate')
                       .toggleClass('hidden', studentsDataLength <= tableLength);
            });

            return $table.DataTable(options);
        },
        onFinishedFetchingGrades = function(response) {
            isFetchingComplete = true;
            isFetchingSuccessful = true;
            if (renderAllGradebook)
                $filtersWrapper.toggleClass('hidden');
            $gradebookNotification.toggleClass('hidden');
            gradeBookData = gradeBookData.concat(response.results);
            gradeBookData = gradeBookData.map(data => {
                data.section_breakdown = data.section_breakdown.filter(b => b.chapter_name !== 'holding section')
                return data;
            });
            renderGradebook(gradeBookData);
        },
        onPageFetched = function(response) {
            if (response.next) {
                gradeBookData = gradeBookData.concat(response.results);
                return fetchGrades(response.next);
            }
            onFinishedFetchingGrades(response);
        },
        renderGradingPolicyFilters = function(studentsData) {
            _templateLoader('_grading_policies', staticPath, function(template) {
                var $tpl = edx.HtmlUtils.template(template)({
                    gradingPolicies: Object.keys(studentsData[0].aggregates)
                }).toString();
                $('#grading-policy').append($tpl);
                $('#grading-policy').append(edx.HtmlUtils.ensureHtml(displayError).toString());
            }, displayError);
        },
        renderGradebook = function(studentsData) {
            if (renderAllGradebook)
                renderGradingPolicyFilters(studentsData);
            renderGradebookTable(studentsData);
        },
        renderGradebookTable = function(studentsData) {
            _templateLoader('_gradebook_table', staticPath, function(template) {
                var $tpl = edx.HtmlUtils.template(template)({
                    studentsData: studentsData,
                    strLib: {
                        userHeading: gettext('Username'),
                        total: gettext('Total')
                    }
                }).toString();
                $gradesTableWrapper.append($tpl);
                createMainDataTable(studentsData.length);
                ShowBlockIdEventBinder();
                filterGradebook();
            }, displayError);
            renderAllGradebook = true;
        },
        startFetchingGrades = function() {
            $gradebookNotification.toggleClass('hidden');
            fetchGrades('api/grades/v1/gradebook/' + courseID + '/');
        };

    $gradingPolicyFilter.change(function() { filterGradebook(); });
    $courseSectionFilter.change(function() { filterGradebook(); });

    function renderModalTemplateData(template) {
        var blockID = $(gradeOverrideObject).attr('data-block-id');
        var studentsData = [];
        var tpl = edx.HtmlUtils.template(template);

        gradeBookData.map(function(userData){
            var gradeData = userData.section_breakdown.filter(function(sectionData){
                return (sectionData.module_id === blockID);
            });

            if (!_.isEmpty(gradeData)) {
                var auto_grade = parseFloat(gradeData[0].auto_grade);
                var score_earned = parseFloat(gradeData[0].score_earned);
                var score_possible = parseFloat(gradeData[0].score_possible);
                var username = userData.username;

                if (! (isNaN(score_earned) || isNaN(score_possible))) {
                    if (! isNaN(auto_grade)) {
                        userAutoGrades[username] = auto_grade + '/' + score_possible;
                        userAdjustedGrades[username] = score_earned + '/' + score_possible;
                    }
                    else
                        userAutoGrades[username] = score_earned + '/' + score_possible;

                    studentsData.push(userData);
                }
            }
        });

        edx.HtmlUtils.setHtml(
            $('#grade-override-modal'),
            tpl({
                studentsData: studentsData,
                strLib: {
                    heading: gettext("The Assignment name is:"),
                    publishGrades: gettext("Publish grades"),
                    noMatch: gettext("No matching records found"),
                    studentNameHeading: gettext("Student Name"),
                    save: gettext("Save"),
                    cancel: gettext("Cancel")
                }
            })
        );
        createModalTable(studentsData.length);
        fillModalTemplate();
    }

    function fillModalTemplate() {
        var $modal = $('.grade-override-modal');
        var $adjustedGradeHeader = $modal.find('#adjusted-grade-header');
        var $manualGradeVisibilityWrapper = $modal.find('#manual-grade-visibility');
        var $saveGradeOverrideButton = $modal.find('.grade-override-modal-save');
        var $tableWrapper = $modal.find('.grade-override-table-wrapper');
        var assignmentName = $(gradeOverrideObject).attr('data-assignment-name');
        var blockID = $(gradeOverrideObject).attr('data-block-id');
        var dataPublished = $(gradeOverrideObject).attr('data-published') || false;
        sectionBlockId = $(gradeOverrideObject).attr('data-section-block-id');
        gradesPublished = JSON.parse(dataPublished);
        isManualGrading = JSON.parse($(gradeOverrideObject).attr('data-manual-grading'));
        $modal.find('.assignment-name-placeholder').text(assignmentName);
        $modal.find('.block-id-placeholder').text(blockID);
        $modal.find('.grade-override-info-container').hide();
        $adjustedGradeHeader.text(isManualGrading ? 'Manual grade' : 'Grade');

        $manualGradeVisibilityWrapper.toggle(isManualGrading);
        $saveGradeOverrideButton.attr('data-manual-grading', isManualGrading);
        $manualGradeVisibilityWrapper.attr('data-visibility', gradesPublished);
        $('input[name=grades-published]').prop('checked', gradesPublished);

        $tableWrapper.attr('data-manual-grading', isManualGrading);
        $tableWrapper.show();
        $modal.find('#modal-table-empty-message').hide();
        $saveGradeOverrideButton.show().prop('disabled', true);
        modalDataTable.$('tr').each(function(){
            $(this).attr('data-block-id', blockID);
            var $adjustedGradePlaceholder = $(this).find('td.user-adjusted-grade');
            var username = $adjustedGradePlaceholder.attr('data-username');

            if (username in userAutoGrades) {
                var autoEarnedGrade = userAutoGrades[username].split('/')[0],
                    autoPossibleGrade = userAutoGrades[username].split('/')[1];
                $adjustedGradePlaceholder.attr('data-score-earned', autoEarnedGrade);
                $adjustedGradePlaceholder.attr('data-score-possible', autoPossibleGrade);

                if (username in userAdjustedGrades) {
                    var adjustedGrade = userAdjustedGrades[username].split('/')[0];
                    $adjustedGradePlaceholder.attr('data-score-earned', adjustedGrade);
                    $adjustedGradePlaceholder.attr('data-sort', adjustedGrade);
                    $adjustedGradePlaceholder.addClass('has-adjusted-score');
                }
                else if (isManualGrading) {
                    $adjustedGradePlaceholder.attr('data-sort', autoEarnedGrade);
                }
                else {
                    $adjustedGradePlaceholder.attr('data-sort', autoEarnedGrade);
                }
                $adjustedGradePlaceholder.find('input').val($adjustedGradePlaceholder.attr('data-score-earned'));
                $adjustedGradePlaceholder.find('span').text($adjustedGradePlaceholder.attr('data-score-possible'));
            }
            else
                $(this).hide();
        });
        $modal.show();
    }

    /* Autograde override modal window manipulation */
    $(document).on('click', '.grade-override', function() {
        gradeOverrideObject = this;
        _templateLoader('_gradebook_modal_table', staticPath, renderModalTemplateData, displayError);
    });

    function setUpDataTableSearch($table, $tableEmptyMessage) {
        $table.on('search.dt', function () {
            if (!$table.DataTable().page.info().recordsDisplay) {
                $tableEmptyMessage.show();
            }
            else {
                $tableEmptyMessage.hide();
            }
        });
    }

    $(document).on('click', '.grade-override-modal-close', function(){
        gradebookOverrideModalReset();
    });

    function gradebookOverrideModalReset() {
        var $modal = $('.grade-override-modal');
        adjustedGradesData = {};
        userAdjustedGrades = {};
        userAutoGrades = {};

        $modal.hide();
        $modal.find('.grade-override-table-wrapper').find('tr').show();
        $modal.find('#manual-grade-visibility').hide();
        $modal.find('.grade-override-message').removeClass('error').empty().hide();
        $modal.find('table').find('input').removeClass('score-visited').removeClass('error');
        $modal.find('table').find('textarea').removeClass('score-visited').removeClass('error');
        $modal.find('#modal-table-empty-message').hide();
        destroyDataTable($('#grade-override-modal-table'));
    }

    /* Block ID modal window manipulation */
    function ShowBlockIdEventBinder() {
        $('.eye-icon.block-id-info').on('click', function(e){
            e.stopPropagation();
            $('.block-id-modal').find('.block-id-placeholder').empty();
            $('.block-id-modal').find('.block-id-placeholder').text($(this).data('block-id'));
            $('.block-id-modal').find('.display-name-placeholder').text($(this).data('display-name'));
            $('.block-id-modal').show();
        });
    }

    function HasUserMadeChanges() {
        var areScoresModified = $('.score-visited').length > 0;
        var originalGradeVisibility = $('#manual-grade-visibility').attr('data-visibility');
        var currentGradeVisibility = JSON.stringify($('input[name=grades-published]').prop('checked'));

        return areScoresModified || originalGradeVisibility !== currentGradeVisibility;
    }

    function ToggleSaveButton(shouldDisable) {
        var $modalSaveButton = $('.grade-override-modal').find('.grade-override-modal-save');
        $modalSaveButton.prop('disabled', shouldDisable);
    }

    $(document).on('keyup focus', '.user-adjusted-grade input', function(){
        var $cell = $(this).parents('td'),
            previousGrade = $cell.attr('data-score-earned');
            adjustedGrade = $(this).val();

        $cell.attr('data-sort', adjustedGrade);

        if (previousGrade != adjustedGrade)
            $(this).addClass('score-visited');
        else
            $(this).removeClass('score-visited');

        ToggleSaveButton(!HasUserMadeChanges());

        modalDataTable.rows().invalidate();
    });

    $(document).on('change', 'input[name=grades-published]', function() {
        ToggleSaveButton(!HasUserMadeChanges());
    });

    function collectOverrideGradebookData() {
        var $modal = $('.grade-override-modal');
        var $table = $modal.find('table').dataTable();
        $table.$('tr').each(function(){
            var $row = $(this);
            var $gradeCell = $row.find('.user-adjusted-grade');
            var $grade = $gradeCell.find('input');
            var username = $gradeCell.attr('data-username');
            var grade;

            if ($grade.hasClass('score-visited'))
                adjustedGradesData[username] = {
                    'block_id' : $row.attr('data-block-id'),
                    'max_grade' : $gradeCell.attr('data-score-possible'),
                    'state' : { 'username': edxUserInfo.username},
                    'user_id' : $row.attr('data-user-id')
                };

            if (username in adjustedGradesData) {
                grade = $grade.val().trim();

                adjustedGradesData[username].grade = grade;
                adjustedGradesData[username].remove_adjusted_grade = true;
                adjustedGradesData[username].section_block_id = sectionBlockId;
            }
        });
    }

    function setInfoMessage(messageText){
        var $messageField = $('.grade-override-modal').find('.grade-override-info-container');
        if(messageText) {
            $messageField.text(messageText);
            $messageField.show();
        }
        else {
            $messageField.empty();
            $messageField.hide();
        }
    }

    $(document).on('click', '.grade-override-modal-save', function() {
        var visibilityData = {};
        if (isManualGrading) {
            visibilityData = {
                'block_id': $('.block-id-placeholder').html(),
                'visibility': JSON.stringify($('input[name=grades-published]').prop('checked')),
            }
        }
        collectOverrideGradebookData();
        if (Object.keys(adjustedGradesData).length === 0 && !isManualGrading)
            return;
        var validStatus = ValidateAdjustedGradesData();
        if (validStatus) {
            setInfoMessage(gettext('Update in progress, please wait...'));
            courseXblockUpdater(
                courseID,
                adjustedGradesData,
                visibilityData,
                function(data){
                    gradebookOverrideModalReset();
                    setInfoMessage();
                    renderAllGradebook = false;
                    gradeBookData = [];
                    $gradesTableWrapper.empty();
                    startFetchingGrades();
                }, function(data){
                    console.log(data);
                }
            );
        }
    });

    function ValidateAdjustedGradesData() {
        var isValid = true;
        var $table = $('.grade-override-modal').find('table');
        var $messageField = $('.grade-override-modal').find('.grade-override-message');
        $messageField.empty();
        _.each(adjustedGradesData, function(data, username){
            adjustedGradesData[username].errors = [];
            var userAdjustedGradeSelector = '*[data-username="' + username + '"].user-adjusted-grade';
            var $adjustedGradePlaceholder = $table.find(userAdjustedGradeSelector).find('input');
            // Is it a valid number
            if (isNaN(data.grade)) {
                isValid = false;
                $adjustedGradePlaceholder.addClass('error');
                adjustedGradesData[username].errors.push('Adjusted grade must be an integer number');
            }

            // Is it within range
            var floatGrade = parseFloat(data.grade);
            var errorMessage;
            if (floatGrade < 0 || floatGrade > parseFloat(data.max_grade)) {
                errorMessage = 'Adjusted grade must be within range [0 - ' + data.max_grade + ']';
                isValid = false;
                $adjustedGradePlaceholder.addClass('error');
                adjustedGradesData[username].errors.push(errorMessage);
            }

            for (var i = 0; i < adjustedGradesData[username].errors.length; i++) {
                $separator = $('<br />');
                $errorMessage = edx.HtmlUtils.joinHtml('Error for user ', username, ': ', adjustedGradesData[username].errors[i]).toString();
                $messageField.append($errorMessage);
                $messageField.append($separator);
            }

            if (adjustedGradesData[username].errors.length === 0) {
                $adjustedGradePlaceholder.removeClass('error');
                delete adjustedGradesData[username].errors;
            }
        });

        if (! isValid) {
            $messageField.addClass('error');
            $messageField.show();
        }

        return isValid;
    }

    $(document).on('change', '#table-data-view-percent', displayGrades);

    $(document).on('change', '#table-data-view-absolute', displayGrades);

    $('.data-score-container-class').each(function(){
        var title = $(this).attr('title');
        if (title !== 'Total' && title !== 'Current grade')
            if ($(this).find('input').length)
                $(this).find('input').prop('disabled', false);
            else
                $(this).text($(this).attr('data-score-absolute'));
    });

    $(document).on('change', '#save-grade-field textarea', function(){
        var editor = $('#save-grade-field'),
            studentID = editor.attr('data-student-id'),
            blockID = editor.attr('data-block-id'),
            module_key = studentID + blockID;

        if (!module_list.users[module_key])
            module_list.users[module_key] = {
                'user_id': studentID,
                'grade': parseFloat(editor.attr('data-new-score')).toFixed(2),
                'max_grade': parseFloat(editor.attr('data-score-possible')).toFixed(2),
                'course_id': courseID,
                'block_id': blockID,
                'state': {}
            };
    });

    if ($gradebookWrapper.attr('data-number-of-students') > 0)
        startFetchingGrades();
});