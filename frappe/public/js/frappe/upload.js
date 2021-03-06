// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// MIT License. See license.txt

// parent, args, callback
frappe.upload = {
	make: function(opts) {
		if(!opts.args) opts.args = {};

		if(opts.allow_multiple === undefined) {
			opts.allow_multiple = 1
		}

		var d = null;
		// create new dialog if no parent given
		if(!opts.parent) {
			d = new frappe.ui.Dialog({
				title: __('Upload Attachment'),
				primary_action_label: __('Attach'),
				primary_action: function() {}
			});
			opts.parent = d.body;
			opts.btn = d.get_primary_btn();
			d.show();
		}

		var $upload = $(frappe.render_template("upload", {opts:opts})).appendTo(opts.parent);
		var $file_input = $upload.find(".input-upload-file");
		var $uploaded_files_wrapper = $upload.find('.uploaded-filename');

		// bind pseudo browse button
		$upload.find(".btn-browse").on("click",
			function() { $file_input.click(); });

		$file_input.on("change", function() {
			if (this.files.length > 0 || opts.files) {
				var fileobjs = null;

				if (opts.files) {
					// files added programmatically
					fileobjs = opts.files;
					delete opts.files;
				} else {
					// files from input type file
					fileobjs = $upload.find(":file").get(0).files;
				}
				var file_array = $.makeArray(fileobjs);

				$upload.find(".web-link-wrapper").addClass("hidden");
				$upload.find(".btn-browse").removeClass("btn-primary").addClass("btn-default");
				$uploaded_files_wrapper.removeClass('hidden').empty();

				file_array = file_array.map(
					file => Object.assign(file, {is_private: 1})
				)
				$upload.data('attached_files', file_array);

				// List of files in a grid
				$uploaded_files_wrapper.append(`
					<div class="list-item list-item--head">
						<div class="list-item__content list-item__content--flex-2">
							${__('Filename')}
						</div>
						<div class="list-item__content" style="flex: 0 0 64px">
							${__('Is Private')}
						</div>
						<div class="list-item__content list-item__content--activity" style="flex: 0 0 32px">
						</div>
					</div>
				`);
				var file_pills = file_array.map(
					file => frappe.upload.make_file_row(file.name, !("is_private" in opts))
				);
				$uploaded_files_wrapper.append(file_pills);
			} else {
				$upload.find(".uploaded-filename").addClass("hidden")
				$upload.find(".web-link-wrapper").removeClass("hidden");
				$upload.find(".private-file").addClass("hidden");
				$upload.find(".btn-browse").removeClass("btn-default").addClass("btn-primary");
			}
		});

		if(opts.files && opts.files.length > 0) {
			$file_input.trigger('change');
		}

		// events
		$uploaded_files_wrapper.on('click', '.list-item-container', function (e) {
			var $item = $(this);
			var filename = $item.attr('data-filename');
			var attached_files = $upload.data('attached_files');
			var $target = $(e.target);

			if ($target.is(':checkbox')) {
				var is_private = $target.is(':checked');

				attached_files = attached_files.map(file => {
					if (file.name === filename) {
						file.is_private = is_private ? 1 : 0;
					}
					return file;
				});
				$upload.data('attached_files', attached_files);
			}
			else if ($target.is('.uploaded-file-remove, .fa-remove')) {
				// remove file from attached_files object
				attached_files = attached_files.filter(file => file.name !== filename);
				$upload.data('attached_files', attached_files);

				// remove row from dom
				$uploaded_files_wrapper
					.find(`.list-item-container[data-filename="${filename}"]`)
					.remove();
			}
		});


		if(!opts.btn) {
			opts.btn = $('<button class="btn btn-default btn-sm">' + __("Attach")
				+ '</div>').appendTo($upload);
		} else {
			$(opts.btn).unbind("click");
		}

		// Primary button handler
		opts.btn.click(function() {
			// close created dialog
			d && d.hide();

			// convert functions to values
			if(opts.get_params) {
				opts.args.params = opts.get_params();
			}

			// Get file url if input is visible
			var file_url = $upload.find('[name="file_url"]:visible');
			file_url = file_url.length && file_url.get(0).value;

			if(file_url) {
				opts.args.file_url = file_url;
				frappe.upload.upload_file(null, opts.args, opts);
			} else {
				var files = $upload.data('attached_files');
				frappe.upload.upload_multiple_files(files, opts.args, opts);
			}
		});
	},
	make_file_row: function(filename, show_private) {
		var template = `
			<div class="list-item-container" data-filename="${filename}">
				<div class="list-item">
					<div class="list-item__content list-item__content--flex-2 ellipsis">
						${filename}
					</div>
					${show_private
					? `<div class="list-item__content ellipsis" style="flex: 0 0 64px;">
							<input type="checkbox" checked/>
						</div>`
					: ''}
					<div class="list-item__content list-item__content--activity ellipsis" style="flex: 0 0 32px;">
						<button class="btn btn-default btn-xs text-muted uploaded-file-remove">
							<span class="fa fa-remove"></span>
						</button>
					</div>
				</div>
			</div>
		`
		return $(template);
	},
	upload_multiple_files: function(files /*FileData array*/, args, opts) {
		var i = -1;

		// upload the first file
		upload_next();
		// subsequent files will be uploaded after
		// upload_complete event is fired for the previous file
		$(document).on('upload_complete', on_upload);

		function upload_next() {
			i += 1;
			var file = files[i];
			args.is_private = file.is_private;
			frappe.upload.upload_file(file, args, opts);
			frappe.show_progress(__('Uploading'), i+1, files.length);
		}

		function on_upload(e, attachment) {
			if (i === files.length - 1) {
				$(document).off('upload_complete', on_upload);
				frappe.hide_progress();
				return;
			}
			upload_next();
		}
	},
	upload_file: function(fileobj, args, opts) {
		if(!fileobj && !args.file_url) {
			if(opts.on_no_attach) {
				opts.on_no_attach();
			} else {
				msgprint(__("Please attach a file or set a URL"));
			}
			return;
		}

		if(args.file_url) {
			frappe.upload._upload_file(fileobj, args, opts);
		} else {
			frappe.upload.read_file(fileobj, args, opts);
		}
	},

	_upload_file: function(fileobj, args, opts, dataurl) {
		if (args.file_size) {
			frappe.upload.validate_max_file_size(args.file_size);
		}

		if(opts.on_attach) {
			opts.on_attach(args, dataurl)
		} else {
			if (opts.confirm_is_private) {
				frappe.prompt({
					label: __("Private"),
					fieldname: "is_private",
					fieldtype: "Check",
					"default": 1
				}, function(values) {
					args["is_private"] = values.is_private;
					frappe.upload.upload_to_server(fileobj, args, opts, dataurl);
				}, __("Private or Public?"));
			} else {
				if ("is_private" in opts) {
					args["is_private"] = opts.is_private;
				}

				frappe.upload.upload_to_server(fileobj, args, opts, dataurl);
			}

		}
	},

	read_file: function(fileobj, args, opts) {
		var freader = new FileReader();

		freader.onload = function() {
			args.filename = fileobj.name;
			if(opts.options && opts.options.toLowerCase()=="image") {
				if(!frappe.utils.is_image_file(args.filename)) {
					msgprint(__("Only image extensions (.gif, .jpg, .jpeg, .tiff, .png, .svg) allowed"));
					return;
				}
			}

			if((opts.max_width || opts.max_height) && frappe.utils.is_image_file(args.filename)) {
				frappe.utils.resize_image(freader, function(_dataurl) {
					dataurl = _dataurl;
					args.filedata = _dataurl.split(",")[1];
					args.file_size = Math.round(args.filedata.length * 3 / 4);
					console.log("resized!")
					frappe.upload._upload_file(fileobj, args, opts, dataurl);
				})
			} else {
				dataurl = freader.result;
				args.filedata = freader.result.split(",")[1];
				args.file_size = fileobj.size;
				frappe.upload._upload_file(fileobj, args, opts, dataurl);
			}
		};

		freader.readAsDataURL(fileobj);
	},

	upload_to_server: function(fileobj, args, opts, dataurl) {
		// var msgbox = msgprint(__("Uploading..."));
		if(opts.start) {
			opts.start();
		}
		ajax_args = {
			"method": "uploadfile",
			args: args,
			callback: function(r) {
				if(!r._server_messages) {
					// msgbox.hide();
				}
				if(r.exc) {
					// if no onerror, assume callback will handle errors
					opts.onerror ? opts.onerror(r) : opts.callback(null, r);
					frappe.hide_progress();
					return;
				}
				var attachment = r.message;
				opts.loopcallback && opts.loopcallback();
				opts.callback && opts.callback(attachment, r);
				$(document).trigger("upload_complete", attachment);
			},
			error: function(r) {
				// if no onerror, assume callback will handle errors
				opts.onerror ? opts.onerror(r) : opts.callback(null, null, r);
				frappe.hide_progress();
				return;
			}
		}

		// copy handlers etc from opts
		$.each(['queued', 'running', "progress", "always", "btn"], function(i, key) {
			if(opts[key]) ajax_args[key] = opts[key];
		});
		return frappe.call(ajax_args);
	},

	get_string: function(dataURI) {
		// remove filename
		var parts = dataURI.split(',');
		if(parts[0].indexOf(":")===-1) {
			var a = parts[2];
		} else {
			var a = parts[1];
		}

		return decodeURIComponent(escape(atob(a)));

	},

	validate_max_file_size: function(file_size) {
		var max_file_size = frappe.boot.max_file_size || 5242880;

		if (file_size > max_file_size) {
			// validate max file size
			frappe.throw(__("File size exceeded the maximum allowed size of {0} MB", [max_file_size / 1048576]));
		}
	},
	multifile_upload:function(fileobjs, args, opts) {

		//loop through filenames and checkboxes then append to list
		var fields = [];
		for (var i =0,j = fileobjs.length;i<j;i++) {
			var filename = fileobjs[i].name;
			fields.push({'fieldname': 'label1', 'fieldtype': 'Heading', 'label': filename});
			fields.push({'fieldname':  filename+'_is_private', 'fieldtype': 'Check', 'label': 'Private', 'default': 1});
			}
			
			var d = new frappe.ui.Dialog({
				'title': __('Make file(s) private or public?'),
				'fields': fields,
				primary_action: function(){
					var i =0,j = fileobjs.length;
					d.hide();
				opts.loopcallback = function (){
				   if (i < j) {
				   	   args.is_private = d.fields_dict[fileobjs[i].name + "_is_private"].get_value()
					   frappe.upload.upload_file(fileobjs[i], args, opts);
					   i++;
				   }        
				}
				
				opts.loopcallback();

				}
			});
			d.show();
			opts.confirm_is_private =  0;
	}

}